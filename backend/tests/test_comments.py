import pytest
import json
from bson.objectid import ObjectId
from datetime import datetime
from unittest.mock import patch

@pytest.fixture
def mock_session_user():
    """Fixture to mock a logged-in user"""
    return {
        'username': 'test_user', 
        'email': 'test@example.com',
        'user_id': '123', 
        'is_moderator': False
    }

@pytest.fixture
def mock_session_moderator():
    """Fixture to mock a logged-in moderator"""
    return {
        'username': 'test_moderator', 
        'email': 'moderator@hw3.com',
        'user_id': '456', 
        'is_moderator': True
    }

@pytest.fixture
def mock_comments():
    """Fixture to create mock comment data"""
    return [
        {
            '_id': ObjectId('60d21b4667d0d8992e610c85'),
            'articleTitle': 'Test Article',
            'username': 'test_user',
            'text': 'This is a test comment',
            'timestamp': datetime.now().isoformat(),
            'replies': [
                {
                    '_id': ObjectId('60d21b4667d0d8992e610c86'),
                    'username': 'another_user',
                    'text': 'This is a reply',
                    'timestamp': datetime.now().isoformat()
                }
            ]
        }
    ]

def test_get_comments(client, monkeypatch, mock_comments):
    """Test fetching comments for an article"""
    # Mock the database find function
    class MockCollection:
        def find(self, query):
            if query.get('articleTitle') == 'Test Article':
                return mock_comments
            return []
    
    monkeypatch.setattr('app.db.comments', MockCollection())
    
    # Call the endpoint
    response = client.get('/api/comments/Test%20Article')
    
    # Check the response
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data) == 1
    assert data[0]['text'] == 'This is a test comment'
    assert len(data[0]['replies']) == 1

def test_add_comment_unauthorized(client):
    """Test adding a comment without being logged in"""
    response = client.post('/api/comments', 
                          json={'articleTitle': 'Test Article', 'text': 'New comment'})
    
    # Should return unauthorized
    assert response.status_code == 401
    data = json.loads(response.data)
    assert 'error' in data

def test_get_comment_count(client, monkeypatch):
    """Test getting comment count for an article"""
    class MockCollection:
        def find_one(self, query):
            if query.get('articleTitle') == 'Test Article':
                return {'commentCount': 5}
            return None
    
    monkeypatch.setattr('app.db.article_stats', MockCollection())
    
    # Call the endpoint
    response = client.get('/api/comment-count/Test%20Article')
    
    # Check the response
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['count'] == 5

def test_serve_index(client):
    """Test the index route"""
    with patch('app.send_from_directory') as mock_send:
        mock_send.return_value = "HTML Content"
        response = client.get('/')
        mock_send.assert_called_once()

def test_get_user_info_not_logged_in(client):
    """Test getting user info when not logged in"""
    response = client.get('/api/user')
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['username'] is None
    assert data['is_moderator'] is False