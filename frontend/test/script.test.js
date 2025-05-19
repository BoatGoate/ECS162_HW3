/**
 * @jest-environment jsdom
 */

// Mock fetch API
global.fetch = jest.fn();

// Setup test DOM
document.body.innerHTML = `
  <button class="hamburger"></button>
  <div class="sidebar" style="display:none"><button class="close-button"></button></div>
  <div class="date-mobile"></div>
  <div id="date-expanded"></div>
  <div class="grid-container"></div>
  <div class="article-footer"></div>
  <div id="comment-sidebar" style="display:none">
    <h3 id="comment-article-title">Test Article</h3>
    <span id="comment-count">(0)</span>
    <button class="comment-close-button"></button>
    <textarea id="comment-textarea"></textarea>
    <div id="comment-buttons" style="display:none">
      <button id="comment-submit"></button>
      <button id="comment-cancel"></button>
    </div>
    <div id="comments-container"></div>
  </div>
  <div id="profile-sidebar" style="display:none">
    <button class="profile-close-button"></button>
    <span id="profile-username"></span>
    <span id="profile-email"></span>
  </div>
  <button id="login-button"></button>
  <button id="profile-button"></button>
  <button id="mobile-profile-button"></button>
`;

// Setup global variables and mocks
global.currPage = 0;
global.isFetching = false;
global.hasMoreArticles = true;
global.isUserModerator = false;
global.commentsData = {};
global.confirm = jest.fn(() => true);
global.alert = jest.fn();

// Mock window properties
Object.defineProperty(window, 'innerHeight', {value: 500});
Object.defineProperty(window, 'pageYOffset', {value: 0});
Object.defineProperty(document.documentElement, 'scrollHeight', {value: 1000});

// Functions to expose internal state for testing
window.updateArticleCommentCounts = function(title, count) { return {title, count}; };

// Import script
const script = require('../script.js');

describe('NYT Frontend Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.querySelector('.grid-container').innerHTML = '';
    document.getElementById('comment-sidebar').style.display = 'none';
    document.getElementById('profile-sidebar').style.display = 'none';
    document.getElementById('comment-textarea').value = '';
    document.getElementById('comment-buttons').style.display = 'none';
  });

  test('utility functions', () => {
    // Test read time estimation
    expect(script.estimateReadTime(225)).toBe('1 MIN READ');
    expect(script.estimateReadTime(450)).toBe('2 MIN READ');
    expect(script.estimateReadTime(0)).toBe('0 MIN READ');
    
    // Test processRedactedText
    expect(script.processRedactedText('Bad word here', 'word here')).toBe('███ word here');
    expect(script.processRedactedText('Same text', 'Same text')).toBe('Same text');
    expect(script.processRedactedText('Some bad words', '')).toBe('████ ███ █████');
  });

  test('UI interactions', () => {
    // Test sidebar toggle
    document.querySelector('.hamburger').click();
    expect(document.querySelector('.sidebar').style.display).toBe('block');
    
    document.querySelector('.close-button').click();
    expect(document.querySelector('.sidebar').style.display).toBe('none');
    
    // Test profile sidebar
    script.setupProfileSidebar();
    
    document.getElementById('profile-button').click();
    expect(document.getElementById('profile-sidebar').style.display).toBe('flex');
    
    document.querySelector('.profile-close-button').click();
    expect(document.getElementById('profile-sidebar').style.display).toBe('none');
  });

  test('API interactions', async () => {
    // Test fetchApiKey
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({key: 'test-key'})
    });
    
    const apiKey = await script.fetchApiKey();
    expect(apiKey).toBe('test-key');
    
    // Test error handling
    fetch.mockResolvedValueOnce({ok: false});
    expect(await script.fetchApiKey()).toBeNull();
    
    // Test fetchNYTData
    fetch.mockImplementation((url) => {
      if (url === '/api/key') {
        return Promise.resolve({
          ok: true, 
          json: () => Promise.resolve({key: 'test-key'})
        });
      } else if (url.includes('api.nytimes.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: {
              docs: [{
                headline: {main: 'Test Article'},
                abstract: 'Test abstract',
                word_count: 300,
                multimedia: [{url: 'test.jpg'}]
              }]
            }
          })
        });
      } else if (url.includes('/api/comment-count/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({count: 5})
        });
      }
      return Promise.resolve({ok: false});
    });
    
    await script.fetchNYTData(0);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('api.nytimes.com'), expect.anything());
  });

  test('comment functionality', async () => {
    // Test setupCommentEventHandlers
    const setupResult = script.setupCommentEventHandlers('Test Article');
    expect(setupResult.success).toBe(true);
    
    // Test textarea behavior
    const textarea = document.getElementById('comment-textarea');
    const buttons = document.getElementById('comment-buttons');
    
    textarea.value = 'Test comment';
    textarea.dispatchEvent(new Event('input'));
    expect(buttons.style.display).toBe('flex');
    
    document.getElementById('comment-cancel').click();
    expect(textarea.value).toBe('');
    expect(buttons.style.display).toBe('none');
    
    // Test submitComment
    fetch.mockImplementation((url) => {
      if (url === '/api/comments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({id: '123'})
        });
      } else if (url.includes('/api/comment-count/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({count: 1})
        });
      }
      return Promise.resolve({ok: false});
    });
    
    await script.submitComment('Test Article', 'Test comment');
    expect(fetch).toHaveBeenCalledWith('/api/comments', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('Test comment')
    }));
  });

  test('comment moderation functions', async () => {
    // Setup mocks
    global.isUserModerator = true;
    document.getElementById('comments-container').innerHTML = `
      <div class="comment" data-id="123">
        <p class="comment-text">Test comment to moderate</p>
      </div>
    `;
    
    fetch.mockImplementation((url) => {
      if (url.includes('/api/comments/123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({message: 'Success'})
        });
      } else if (url.includes('/api/comment-count/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({count: 0})
        });
      }
      return Promise.resolve({ok: false});
    });
    
    // Test processRedactedText return value
    const result = script.processRedactedText(
      'This contains sensitive information', 
      'This contains information'
    );
    expect(result).toBe('This contains █████████ information');
    
    // Test deleteComment
    const deleteResult = await script.deleteComment('123');
    expect(deleteResult.success).toBe(true);
    
    // Test redactComment (indirectly)
    const commentElement = document.querySelector('.comment[data-id="123"] .comment-text');
    expect(commentElement.textContent).toBe('[Comment removed by a moderator]');
  });

  test('toggleReplyForm function', () => {
    // Setup mock reply form
    document.getElementById('comments-container').innerHTML = `
      <div class="comment" data-id="456">
        <div id="reply-form-456" style="display:none">
          <textarea class="reply-textarea"></textarea>
        </div>
      </div>
    `;
    
    const replyForm = document.getElementById('reply-form-456');
    
    // Test showing the form
    script.toggleReplyForm('456');
    expect(replyForm.style.display).toBe('block');
    
    // Test hiding the form
    script.toggleReplyForm('456');
    expect(replyForm.style.display).toBe('none');
  });
});

// Clean up any unresolved promises
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 50));
});

// Suppress console.error
console.error = jest.fn();