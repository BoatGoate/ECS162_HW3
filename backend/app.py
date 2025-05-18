from flask import Flask, redirect, url_for, session, jsonify, send_file, send_from_directory
from authlib.integrations.flask_client import OAuth
from authlib.common.security import generate_token
from dotenv import load_dotenv
from flask_cors import CORS
import os

load_dotenv()

app = Flask(__name__)
# Use a fixed secret key instead of randomly generating it on each restart
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev_secret_key_for_testing')
CORS(app)  # Enable CORS for all routes

oauth = OAuth(app)

# Don't generate the nonce here, we'll do it in the login route

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
    # Generate a new nonce for each login attempt
    nonce = generate_token()
    session['nonce'] = nonce
    redirect_uri = 'http://localhost:8000/authorize'
    return oauth.flask_app.authorize_redirect(redirect_uri, nonce=nonce)

@app.route('/authorize')
def authorize():
    token = oauth.flask_app.authorize_access_token()
    nonce = session.get('nonce')

    user_info = oauth.flask_app.parse_id_token(token, nonce=nonce)
    session['user'] = {
        "username": user_info.get("preferred_username", user_info.get("email")),
        "email": user_info.get("email")
    }

    # Redirect to the main page (index.html)
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
        return jsonify({"username": user.get("username")})
    return jsonify({"username": None})

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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)
