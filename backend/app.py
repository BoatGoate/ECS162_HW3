from flask import Flask, redirect, url_for, session, jsonify, send_file, send_from_directory, request
from authlib.integrations.flask_client import OAuth
from authlib.common.security import generate_token
from dotenv import load_dotenv
from flask_cors import CORS
from pymongo import MongoClient
import os
import json
from bson.objectid import ObjectId
from datetime import datetime

load_dotenv()

app = Flask(__name__)
# Use a fixed secret key instead of randomly generating it on each restart
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev_secret_key_for_testing')
CORS(app)  # Enable CORS for all routes

# MongoDB Connection
mongo_uri = os.getenv('MONGO_URI', 'mongodb://mongo:27017/')
client = MongoClient(mongo_uri)
db = client.nyt_comments_db  # Use a new database for our comments

oauth = OAuth(app)

nonce = generate_token()

oauth.register(
    name=os.getenv('OIDC_CLIENT_NAME'),
    client_id=os.getenv('OIDC_CLIENT_ID'),
    client_secret=os.getenv('OIDC_CLIENT_SECRET'),
    #server_metadata_url='http://dex:5556/.well-known/openid-configuration',
    authorization_endpoint="http://localhost:5556/auth",
    token_endpoint="http://dex:5556/token",
    jwks_uri="http://dex:5556/keys",
    userinfo_endpoint="http://dex:5556/userinfo",
    device_authorization_endpoint="http://dex:5556/device/code",
    client_kwargs={'scope': 'openid email profile'}
)

@app.route('/')
def serve_index():
    # Serve the index.html file from the frontend folder
    frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend'))
    return send_from_directory(frontend_path, 'index.html')

@app.route('/login')
def login():
    redirect_uri = 'http://localhost:8000/authorize'
    # No nonce is used, just authorize the redirect, this shit causing issues frfr, no security :)
    return oauth.flask_app.authorize_redirect(redirect_uri)

@app.route('/authorize')
def authorize():
    try:
        # No need to check for nonce, just authorize the access token
        token = oauth.flask_app.authorize_access_token()
        
        # The token will be used to get user info
        user_info = oauth.flask_app.parse_id_token(token, nonce=None)
        
        # Get user email for a more reliable check
        email = user_info.get("email", "")
        print(f"DEBUG - User email: {email}")
        
        # Check if user is a moderator by email (more reliable)
        is_moderator = email == "moderator@hw3.com"
        print(f"DEBUG - Is moderator (by email): {is_moderator}")
        
        # Store user information in session
        session['user'] = {
            "username": user_info.get("username", user_info.get("email")),
            "email": email,
            "user_id": user_info.get("sub", user_info.get("uid", user_info.get("userID", "unknown"))),
            "is_moderator": is_moderator
        }

        # Redirect to the main application page
        return redirect('/app')
    except Exception as e:
        print(f"DEBUG - Authorization error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    return redirect('/app')

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

@app.route('/api/key')
def get_api_key():
    nyt_api_key = os.getenv('NYT_API_KEY')
    if not nyt_api_key:
        return jsonify({"error": "API key not found"}), 500
    return jsonify({"key": nyt_api_key})

@app.route('/api/user')
def get_user_info():
    user = session.get('user')
    if user:
        # Check if this is the moderator email as a fallback method
        email = user.get("email")
        is_mod = user.get("is_moderator", False)
        
        # If user_id wasn't properly set but email matches moderator, set is_mod to True
        if email == "moderator@hw3.com" and not is_mod:
            is_mod = True
            # Also update the session
            session['user']["is_moderator"] = True
            session.modified = True  # Mark the session as modified so it gets saved
        
        print(f"DEBUG - Sending user info: {user.get('username')}, is_moderator: {is_mod}, email: {email}")
        return jsonify({
            "username": user.get("username"),
            "is_moderator": is_mod,
            "user_id": user.get("user_id", "unknown"),
            "email": email
        })
    return jsonify({"username": None, "is_moderator": False})

@app.route('/api/user-details')
def get_user_details():
    user = session.get('user')
    if user:
        return jsonify({
            "username": user.get("username"),
            "email": user.get("email")
        })
    return jsonify({"username": None, "email": None})

@app.route('/app')
def serve_app():
    # Serve the index.html file from the frontend folder
    frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend'))
    return send_from_directory(frontend_path, 'index.html')

@app.route('/<path:filename>')
def serve_files(filename):
    frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend'))
    return send_from_directory(frontend_path, filename)

# Comment-related API endpoints
@app.route('/api/comments/<article_title>', methods=['GET'])
def get_comments(article_title):
    """Get all comments for a specific article"""
    try:
        # URL parameters are automatically decoded by Flask, so we don't need to decode again
        comments = list(db.comments.find({'articleTitle': article_title}))
        
        # Convert ObjectId to string for JSON serialization
        for comment in comments:
            comment['_id'] = str(comment['_id'])
            if 'replies' in comment:
                for reply in comment['replies']:
                    if '_id' in reply:
                        reply['_id'] = str(reply['_id'])
        
        return jsonify(comments)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/comments', methods=['POST'])
def add_comment():
    """Add a new comment to an article"""
    try:
        data = request.json
        
        # Check if user is logged in
        user = session.get('user')
        if not user:
            return jsonify({"error": "You must be logged in to comment"}), 401        # Create new comment
        # URL-decode the article title to ensure consistency
        import urllib.parse
        article_title = urllib.parse.unquote(data['articleTitle'])
        
        comment = {
            'articleTitle': article_title, 
            'username': user.get('username'),
            'text': data['text'],
            'timestamp': datetime.now().isoformat(),
            'replies': []
        }
        
        # Insert the comment into MongoDB
        result = db.comments.insert_one(comment)
        # comment count
        db.article_stats.update_one(
            {'articleTitle': article_title},
            {'$inc': {'commentCount': 1}},
            upsert=True
        )
        
        return jsonify({"id": str(result.inserted_id), "success": True}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/comments/<comment_id>/replies', methods=['POST'])
def add_reply(comment_id):
    """Add a reply to a specific comment"""
    try:
        data = request.json
        
        # Check if user is logged in
        user = session.get('user')
        if not user:
            return jsonify({"error": "You must be logged in to reply"}), 401
        
        # Create new reply
        reply = {
            'username': user.get('username'),
            'text': data['text'],
            'timestamp': datetime.now().isoformat(),
            '_id': ObjectId()
        }
          # Add reply to comment
        result = db.comments.update_one(
            {'_id': ObjectId(comment_id)},
            {'$push': {'replies': reply}}
        )
        
        if result.modified_count == 0:
            return jsonify({"error": "Comment not found"}), 404
            
        # Get the article title from the parent comment
        comment = db.comments.find_one({'_id': ObjectId(comment_id)})
        if comment and 'articleTitle' in comment:
            # Update comment count for the article (replies also count towards total)
            db.article_stats.update_one(
                {'articleTitle': comment['articleTitle']},
                {'$inc': {'commentCount': 1}},
                upsert=True
            )
        
        return jsonify({"id": str(reply['_id']), "success": True}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/comment-count/<article_title>', methods=['GET'])
def get_comment_count(article_title):
    """Get the comment count for a specific article"""
    try:
        # URL parameters are automatically decoded by Flask, so we don't need to decode again
        # Use the article title as-is for consistency, DO NOT CHANGE THIS I PLZZZZ
        stats = db.article_stats.find_one({'articleTitle': article_title})
        count = stats['commentCount'] if stats else 0
        if not stats:
            count = db.comments.count_documents({'articleTitle': article_title})
            
        return jsonify({"count": count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/all-comments', methods=['GET'])
def get_all_comments():
    comments = list(db.comments.find({}, {'_id': 1, 'text': 1, 'username': 1, 'created_at': 1}))
    for comment in comments:
        comment['_id'] = str(comment['_id'])
    return jsonify(comments), 200

@app.route('/api/comments/<comment_id>', methods=['DELETE'])
def delete_comment(comment_id):
    # Check if user is logged in
    user = session.get('user')
    if not user:
        return jsonify({"error": "You must be logged in to delete comments"}), 401
    
    # Check if user is a moderator
    email = user.get("email", "")
    is_moderator = email == "moderator@hw3.com" or user.get('is_moderator', False)
    
    if not is_moderator:
        return jsonify({"error": "Only moderators can delete comments"}), 403
    
    try:
        # Find the comment (to verify it exists)
        comment = db.comments.find_one({'_id': ObjectId(comment_id)})
        if not comment:
            return jsonify({'error': 'Comment not found'}), 404
        
        # Get the article title for statistics updates
        article_title = comment.get('articleTitle')
        
        # Mark as deleted instead of actually deleting
        result = db.comments.update_one(
            {'_id': ObjectId(comment_id)},
            {'$set': {
                'text': "[Comment removed by a moderator]",
                'removed_at': datetime.now().isoformat(),
                'removed_by': user.get('username')
            }}
        )
        
        if result.modified_count == 1:
            print(f"Comment {comment_id} successfully updated to show removal message")
            return jsonify({'message': 'Comment removed successfully'}), 200
        else:
            print(f"Failed to update comment {comment_id}")
            return jsonify({'error': 'Failed to remove comment'}), 500
    
    except Exception as e:
        print(f"Error in delete_comment: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/comments/<comment_id>', methods=['PUT'])
def update_comment(comment_id):
    data = request.json
    if not data or 'comment' not in data:
        return jsonify({'error': 'Invalid data'}), 400

    result = db.comments.update_one(
        {'_id': ObjectId(comment_id)},
        {'$set': {'text': data['comment'], 'updated_at': datetime.utcnow()}}
    )
    if result.matched_count == 1:
        return jsonify({'message': 'Comment updated'}), 200
    return jsonify({'error': 'Comment not found'}), 404

@app.route('/api/comments/<comment_id>/replies/<reply_id>', methods=['DELETE'])
def delete_reply(comment_id, reply_id):
    # Check if user is logged in
    user = session.get('user')
    if not user:
        return jsonify({"error": "You must be logged in to delete replies"}), 401
    
    # Check if user is a moderator by email (more reliable)
    email = user.get("email", "")
    is_moderator = email == "moderator@hw3.com" or user.get('is_moderator', False)
    
    # Add debug logging
    print(f"DEBUG - Delete reply request from: {email}, is_moderator: {is_moderator}")
    
    # Check if user is a moderator
    if not is_moderator:
        return jsonify({"error": "Only moderators can delete replies"}), 403
        
    # Verify the parent comment exists
    comment = db.comments.find_one({'_id': ObjectId(comment_id)})
    if not comment:
        return jsonify({'error': 'Parent comment not found'}), 404
    
    # Mark the reply as deleted instead of actually removing it
    result = db.comments.update_one(
        {'_id': ObjectId(comment_id), 'replies._id': ObjectId(reply_id)},
        {'$set': {
            'replies.$.text': "",
            'replies.$.removed_at': datetime.now().isoformat(),
            'replies.$.removed_by': user.get('username')
        }}
    )
    
    if result.modified_count == 1:
        return jsonify({'message': 'Reply removed successfully'}), 200
    return jsonify({'error': 'Reply not found'}), 404

@app.route('/api/comments/<comment_id>/redact', methods=['PUT'])
def redact_comment(comment_id):
    """Redact a comment (moderators only)"""
    # Check if user is logged in
    user = session.get('user')
    if not user:
        return jsonify({"error": "You must be logged in to redact comments"}), 401
    
    # Check if user is a moderator
    email = user.get("email", "")
    is_moderator = email == "moderator@hw3.com" or user.get('is_moderator', False)
    
    if not is_moderator:
        return jsonify({"error": "Only moderators can redact comments"}), 403
    
    # Update the comment with redacted message
    result = db.comments.update_one(
        {'_id': ObjectId(comment_id)},
        {'$set': {
            'text': "[This comment has been redacted by a moderator]",
            'redacted_at': datetime.now().isoformat(),
            'redacted_by': user.get('username')
        }}
    )
    
    if result.matched_count == 1:
        return jsonify({'message': 'Comment redacted successfully'}), 200
    return jsonify({'error': 'Comment not found'}), 404

@app.route('/api/comments/<comment_id>/replies/<reply_id>/redact', methods=['PUT'])
def redact_reply(comment_id, reply_id):
    """Redact a reply (moderators only)"""
    # Check if user is logged in
    user = session.get('user')
    if not user:
        return jsonify({"error": "You must be logged in to redact replies"}), 401
    
    # Check if user is a moderator
    email = user.get("email", "")
    is_moderator = email == "moderator@hw3.com" or user.get('is_moderator', False)
    
    if not is_moderator:
        return jsonify({"error": "Only moderators can redact replies"}), 403
    
    # Update the reply with redacted message
    result = db.comments.update_one(
        {'_id': ObjectId(comment_id), 'replies._id': ObjectId(reply_id)},
        {'$set': {
            'replies.$.text': "[This reply has been redacted by a moderator]",
            'replies.$.redacted_at': datetime.now().isoformat(),
            'replies.$.redacted_by': user.get('username')
        }}
    )
    
    if result.matched_count == 1:
        return jsonify({'message': 'Reply redacted successfully'}), 200
    return jsonify({'error': 'Reply not found'}), 404

@app.route('/api/comments/<comment_id>/partial-redact', methods=['PUT'])
def partial_redact_comment(comment_id):
    """Partially redact a comment (moderators only)"""
    # Check if user is logged in
    user = session.get('user')
    if not user:
        return jsonify({"error": "You must be logged in to redact comments"}), 401
    
    # Check if user is a moderator
    email = user.get("email", "")
    is_moderator = email == "moderator@hw3.com" or user.get('is_moderator', False)
    
    if not is_moderator:
        return jsonify({"error": "Only moderators can redact comments"}), 403
    
    # Get the redacted text from request
    data = request.json
    if not data or 'redactedText' not in data:
        return jsonify({'error': 'No redacted text provided'}), 400
    
    # Update the comment with partially redacted text
    result = db.comments.update_one(
        {'_id': ObjectId(comment_id)},
        {'$set': {
            'text': data['redactedText'],
            'partially_redacted_at': datetime.now().isoformat(),
            'redacted_by': user.get('username')
        }}
    )
    
    if result.matched_count == 1:
        return jsonify({'message': 'Comment partially redacted successfully'}), 200
    return jsonify({'error': 'Comment not found'}), 404

@app.route('/api/comments/<comment_id>/replies/<reply_id>/partial-redact', methods=['PUT'])
def partial_redact_reply(comment_id, reply_id):
    """Partially redact a reply (moderators only)"""
    # Check if user is logged in
    user = session.get('user')
    if not user:
        return jsonify({"error": "You must be logged in to redact replies"}), 401
    
    # Check if user is a moderator
    email = user.get("email", "")
    is_moderator = email == "moderator@hw3.com" or user.get('is_moderator', False)
    
    if not is_moderator:
        return jsonify({"error": "Only moderators can redact replies"}), 403
    
    # Get the redacted text from request
    data = request.json
    if not data or 'redactedText' not in data:
        return jsonify({'error': 'No redacted text provided'}), 400
    
    # Update the reply with partially redacted text
    result = db.comments.update_one(
        {'_id': ObjectId(comment_id), 'replies._id': ObjectId(reply_id)},
        {'$set': {
            'replies.$.text': data['redactedText'],
            'replies.$.partially_redacted_at': datetime.now().isoformat(),
            'replies.$.redacted_by': user.get('username')
        }}
    )
    
    if result.matched_count == 1:
        return jsonify({'message': 'Reply partially redacted successfully'}), 200
    return jsonify({'error': 'Reply not found'}), 404

# docker-compose -f docker-compose.dev.yml down -v
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)