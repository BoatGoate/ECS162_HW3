import json
import pytest
import os

def test_get_api_key_success(client):
    """Test that the /api/key endpoint returns the API key successfully."""
    response = client.get('/api/key')
    assert response.status_code == 200
    
    data = json.loads(response.data)
    assert 'key' in data  # Changed from 'apiKey' to 'key'
    assert data['key'] == 'test_api_key'  # Changed from data['apiKey'] to data['key']

def test_content_type_json(client):
    """Test that the response content type is application/json."""
    response = client.get('/api/key')
    assert response.content_type == 'application/json'