import json
import pytest
import os
import unittest.mock

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

def test_get_articles_success(client, monkeypatch):
    """Test that the /api/articles endpoint returns articles successfully."""
    # Mock the requests.get function
    mock_response = unittest.mock.Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "response": {
            "docs": [
                {
                    "headline": {"main": "Test Article"},
                    "abstract": "Test abstract",
                    "word_count": 300,
                    "multimedia": [{"url": "test.jpg"}]
                }
            ]
        }
    }
    
    with unittest.mock.patch('requests.get', return_value=mock_response):
        response = client.get('/api/articles?q=test&page=0')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert 'response' in data
        assert 'docs' in data['response']
        assert len(data['response']['docs']) == 1
        assert data['response']['docs'][0]['headline']['main'] == 'Test Article'

def test_get_articles_nyt_api_error(client, monkeypatch):
    """Test handling of NYT API errors."""
    # Mock the requests.get function
    mock_response = unittest.mock.Mock()
    mock_response.status_code = 500
    
    with unittest.mock.patch('requests.get', return_value=mock_response):
        response = client.get('/api/articles')
        assert response.status_code == 500
        
        data = json.loads(response.data)
        assert 'error' in data