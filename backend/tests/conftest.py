'''
Sources:
- https://www.geeksforgeeks.org/conftest-in-pytest/
- https://docs.pytest.org/en/latest/fixture.html#conftest-py-sharing-fixture-functions
'''

import pytest
import os
import sys

# since we have modified directory structure (tests folder)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app as flask_app

@pytest.fixture
def app():
    """Create and configure a Flask app for testing."""
    os.environ['NYT_API_KEY'] = 'test_api_key'
    flask_app.config.update({
        "TESTING": True,
    })
    
    yield flask_app

@pytest.fixture
def client(app):
    return app.test_client()