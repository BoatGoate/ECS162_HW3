// Query for NYT API
const query = "davis+sacramento";

// Get sidebar to show/hide
const hamburger = document.querySelector('.hamburger');
const sidebar = document.querySelector('.sidebar');
const closeBtn = document.querySelector('.close-button');

hamburger.addEventListener('click', () => {
    sidebar.style.display = 'block';
});

closeBtn.addEventListener('click', () => {
    sidebar.style.display = 'none';
});

// Get and Set Date Dynamically
const dateMobile = document.querySelector('.date-mobile');
const dateDesktop = document.querySelector('#date-expanded');
const params = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const today = new Date();
dateMobile.textContent = today.toLocaleDateString('en-US', params);
dateDesktop.textContent = today.toLocaleDateString('en-US', params);

// Global infinite scroll variables
let currPage = 0;
let isFetching = false;
let hasMoreArticles = true;
const MAX_REQUESTS = 3; // Limit to 3 API requests total (we want to show the footer too)

// Add a global variable to track if the user is a moderator
let isUserModerator = false;

// Estimate reading time based on word count
function estimateReadTime(wordCount) {
    // Avg WPM is 225
    const wordsPerMinute = 225;
    const minutes = Math.round(wordCount / wordsPerMinute);
    return `${minutes} MIN READ`;
}

function generateCommentNumber() {
    // Generate a random number between 100 and 200
    const randomNumber = Math.floor(Math.random() * 100) + 100;
    return randomNumber;
}

// Fetch API key from the backend
async function fetchApiKey() {
    try {
        const response = await fetch('/api/key');
        if (response.ok) {
            const data = await response.json();
            return data.key;
        } else {
            console.error('Failed to fetch API key:', response.status);
            return null;
        }
    } catch (error) {
        console.error('Error fetching API key:', error);
        return null;
    }
}

// Fetch NYT data and display it
// About: https://developer.nytimes.com/docs/articlesearch-product/1/overview
async function fetchNYTData(page = 0) { // page is passed to api as well
    // Ensures max articles loaded or no fetching in progress or no more articles to fetch
    if (isFetching || !hasMoreArticles || page >= MAX_REQUESTS) {
        if (page >= MAX_REQUESTS) {
            hasMoreArticles = false;
        }
        return;
    }
    
    isFetching = true;
    
    try {
        const apiKey = await fetchApiKey();
        if (!apiKey) {
            console.error('No API key available');
            isFetching = false;
            return;
        }
        
        // API call to NYT with query and page number
        const response = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${query}&page=${page}&api-key=${apiKey}`);
        if (response.ok) {
            const data = await response.json();
            
            // Check if we received articles
            if (data.response.docs && data.response.docs.length > 0) {
                displayArticles(data.response.docs, page === 0);
                currPage = page;
            } else {
                // No more articles to fetch
                hasMoreArticles = false;
            }
        } else { // error handling for API response
            console.error('Failed to fetch NYT data:', response.status);
            hasMoreArticles = false;
        }
    } catch (error) {
        console.error('Error fetching NYT data:', error);
        hasMoreArticles = false;
    } finally {
        isFetching = false;
    }
}

// Display articles in the grid container
async function displayArticles(articles, clearExisting = false) {
    const gridContainer = document.querySelector('.grid-container');
    
    // Clear existing content if needed (first page load)
    if (clearExisting) {
        gridContainer.innerHTML = '';
    }
    
    // Add articles to the grid
    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        
        // Create article container
        const articleDiv = document.createElement('div');
        
        // Get the multimedia URL or use a placeholder if not available
        let hasImage = false;
        let imgUrl = 'assets/logo.png'; // Default placeholder
        
        if (article.multimedia && Array.isArray(article.multimedia) && article.multimedia.length > 0) {
            // Handle different multimedia format (array)
            imgUrl = `https://www.nytimes.com/${article.multimedia[0].url}`;
            hasImage = true;
        } else if (article.multimedia && article.multimedia.default && article.multimedia.default.url) {
            // Handle different multimedia format (object)
            imgUrl = article.multimedia.default.url;
            hasImage = true;
        }
        
        // Add image if available
        if (hasImage) {
            const image = document.createElement('img');
            image.src = imgUrl;
            image.loading = 'lazy'; // lazy loading
            articleDiv.appendChild(image);
        }
        
        // Add title
        const newsTitle = document.createElement('h2');
        newsTitle.className = "news-title";
        newsTitle.textContent = article.headline.main;
        articleDiv.appendChild(newsTitle);
        
        // Add description (abstract or snippet)
        const subtitle = document.createElement('p');
        subtitle.className = "sub-title";
        subtitle.textContent = article.abstract || article.snippet || '';
        articleDiv.appendChild(subtitle);
        
        // Add reading time
        const readTime = document.createElement('p');
        readTime.className = "read-time";
        readTime.textContent = estimateReadTime(article.word_count || 500); // Default to 500 if word_count is not available

        // Add comment tag
        const commentTag = document.createElement('p');
        commentTag.className = "comment-tag";
        
        // Add comment icon and number
        const commentIcon = document.createElement('i');
        commentIcon.className = "material-icons";
        commentIcon.textContent = "comment";
        commentTag.appendChild(commentIcon);

        // Initialize commentNumber with a default value
        let commentNumber = 0;

        try {
            // Use article.headline.main instead of undefined currentArticleTitle
            const countResponse = await fetch(`/api/comment-count/${encodeURIComponent(article.headline.main)}`);
            if (countResponse.ok) {
                const data = await countResponse.json();
                commentNumber = data.count;
                commentTag.appendChild(document.createTextNode(` ${commentNumber}`));
            }
        } catch (error) {
            console.error('Error updating comment count:', error);
            // Add a default value for errors
            commentTag.appendChild(document.createTextNode(` 0`));
        }
        
        // Create a wrapper div for read time and comment tag
        const articleFooter = document.createElement('div');
        articleFooter.className = "article-footer";
        articleFooter.appendChild(readTime);
        articleFooter.appendChild(commentTag);
        articleDiv.appendChild(articleFooter);
        
        // Store article data for comment sidebar
        commentTag.addEventListener('click', () => {
            openCommentSidebar(article.headline.main, commentNumber);
            console.log("Comment tag clicked, article title:", article.headline.main);
            console.log("Comment number:", commentNumber);
        });
        
        // Add article to grid
        gridContainer.appendChild(articleDiv);
    }
}

// Check if user has scrolled near the bottom
// https://stackoverflow.com/questions/6456846/how-to-do-an-infinite-scroll-in-plain-javascript
function checkScroll() {
    // stop checking scroll after max requests
    if (currPage >= MAX_REQUESTS - 1) {
        window.removeEventListener('scroll', checkScroll);
        return;
    }
    
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // If near bottom (250 px), load more articles
    if (scrollTop + windowHeight + 250 >= documentHeight) {
        if (!isFetching && hasMoreArticles) {
            fetchNYTData(currPage + 1);
        }
    }
}

// Handle profile sidebar open/close
function setupProfileSidebar() {
    const profileSidebar = document.getElementById('profile-sidebar');
    const profileButton = document.getElementById('profile-button');
    const mobileProfileButton = document.getElementById('mobile-profile-button');
    const closeButton = document.querySelector('.profile-close-button');
    
    // Open sidebar when profile button is clicked
    if (profileButton) {
        profileButton.addEventListener('click', () => {
            profileSidebar.style.display = 'flex';
        });
    }
    
    // Open sidebar when mobile profile button is clicked
    if (mobileProfileButton) {
        mobileProfileButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fetch('/api/user')
                .then(response => response.json())
                .then(data => {
                    if (data.username) {
                        // User is logged in, show profile sidebar
                        profileSidebar.style.display = 'flex';
                    } else {
                        // User is not logged in, redirect to login page
                        window.location.href = '/login';
                    }
                })
                .catch(error => {
                    console.error('Error checking login status:', error);
                    window.location.href = '/login';
                });
        });
    }
    
    // Close sidebar when close button is clicked
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            profileSidebar.style.display = 'none';
        });
    }
    
    // Close sidebar when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target == profileSidebar) {
            profileSidebar.style.display = 'none';
        }
    });
}

// Comment sidebar functionality
let commentsData = {}; // Store comments for each article

// Open comment sidebar for a specific article
async function openCommentSidebar(articleTitle, commentCount) {
    const commentSidebar = document.getElementById('comment-sidebar');
    const articleTitleElem = document.getElementById('comment-article-title');
    const commentCountElem = document.getElementById('comment-count');
    const commentsContainer = document.getElementById('comments-container');
    
    // Set article title
    articleTitleElem.textContent = articleTitle;
    
    try {
        // Try to get comment count from server
        const countResponse = await fetch(`/api/comment-count/${encodeURIComponent(articleTitle)}`);
        if (countResponse.ok) {
            const data = await countResponse.json();
            commentCountElem.textContent = `(${data.count})`;
        } else {
            // Fall back to local count if server fails
            commentCountElem.textContent = commentCount;
        }
    } catch (error) {
        console.error('Error getting comment count:', error);
        commentCountElem.textContent = commentCount;
    }
    
    // Show the sidebar
    commentSidebar.style.display = 'flex';
    
    // Load comments from the server
    await fetchComments(articleTitle);
    
    // Setup event handlers
    setupCommentEventHandlers(articleTitle);
}

// Fetch comments from server
async function fetchComments(articleTitle) {
    try {
        console.log(`YUHHHH /api/comments/${encodeURIComponent(articleTitle)}`);
        const response = await fetch(`/api/comments/${encodeURIComponent(articleTitle)}`);
        
        if (response.ok) {
            const comments = await response.json();
            commentsData[articleTitle] = comments;
            displayComments(articleTitle);
        } else {
            console.error('Failed to fetch comments:', response.status);
            // Display empty comments list if fetch fails
            commentsData[articleTitle] = [];
            displayComments(articleTitle);
        }
    } catch (error) {
        console.error('Error fetching comments:', error);
        commentsData[articleTitle] = [];
        displayComments(articleTitle);
    }
}

// Display comments for a specific article
function displayComments(articleTitle) {
    const commentsContainer = document.getElementById('comments-container');
    
    // Clear existing comments
    commentsContainer.innerHTML = '';
    
    // Get comments for this article
    const articleComments = commentsData[articleTitle] || [];
    
    // Create and append comment elements
    articleComments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsContainer.appendChild(commentElement);
    });
}

// Create a comment element
function createCommentElement(comment, isReply = false, parentId = null) {
    console.log("Creating comment element, moderator status:", isUserModerator);
    
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment';
    commentDiv.dataset.id = comment._id || comment.id; // MongoDB uses _id
    
    // Comment author info
    const authorDiv = document.createElement('div');
    authorDiv.className = 'comment-author';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'comment-avatar';
    
    const avatarIcon = document.createElement('i');
    avatarIcon.className = 'material-icons';
    avatarIcon.textContent = 'person';
    avatarDiv.appendChild(avatarIcon);
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'comment-username';
    usernameSpan.textContent = comment.username;
    
    authorDiv.appendChild(avatarDiv);
    authorDiv.appendChild(usernameSpan);
    commentDiv.appendChild(authorDiv);
    
    // Comment text
    const commentText = document.createElement('p');
    commentText.className = 'comment-text';
    commentText.textContent = comment.text;
    commentDiv.appendChild(commentText);
    
    // Comment actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'comment-actions';
    
    // 1. Reply button (always first)
    const replyButton = document.createElement('button');
    replyButton.className = 'reply-button';
    replyButton.textContent = 'Reply';
    replyButton.addEventListener('click', () => {
        if (isReply) {
            // This is a reply to a reply
            toggleReplyForm(comment._id || comment.id, true, parentId);
        } else {
            // This is a reply to a comment
            toggleReplyForm(comment._id || comment.id);
        }
    });
    
    actionsDiv.appendChild(replyButton);
    
    // 2. Add redact button for moderators (second position)
    if (isUserModerator) {
        const redactButton = document.createElement('button');
        redactButton.className = 'redact-button';
        redactButton.textContent = 'Redact';
        
        // Use different redact functions for comments and replies
        if (isReply && parentId) {
            redactButton.addEventListener('click', () => {
                redactReply(parentId, comment._id || comment.id);
            });
        } else {
            redactButton.addEventListener('click', () => {
                redactComment(comment._id || comment.id);
            });
        }
        
        actionsDiv.appendChild(redactButton);
    }
    
    // 3. Add delete button for moderators (third position - far right)
    if (isUserModerator) {
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.style.marginLeft = 'auto'; // Push to far right
        
        // Use different delete functions for comments and replies
        if (isReply && parentId) {
            deleteButton.addEventListener('click', () => {
                deleteReply(parentId, comment._id || comment.id);
            });
        } else {
            deleteButton.addEventListener('click', () => {
                deleteComment(comment._id || comment.id);
            });
        }
        
        actionsDiv.appendChild(deleteButton);
    }
    
    commentDiv.appendChild(actionsDiv);
    
    // Reply form (initially hidden)
    const replyFormDiv = document.createElement('div');
    replyFormDiv.className = 'reply-input-container';
    const commentId = comment._id || comment.id;
    replyFormDiv.id = `reply-form-${commentId}`;
    
    const replyTextarea = document.createElement('textarea');
    replyTextarea.className = 'reply-textarea';
    replyTextarea.placeholder = 'Write a reply...';
    
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'reply-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'comment-cancel';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
        toggleReplyForm(commentId);
    });
    
    const submitButton = document.createElement('button');
    submitButton.className = 'comment-submit';
    submitButton.textContent = 'Reply';
    submitButton.addEventListener('click', () => {
        const form = replyFormDiv;
        const isReplyToReply = form.dataset.isReplyToReply === 'true';
        const parentCommentId = form.dataset.parentCommentId;
        
        if (isReplyToReply && parentCommentId) {
            // Submit as a nested reply
            submitNestedReply(parentCommentId, commentId, replyTextarea.value);
        } else {
            // Submit as a regular reply
            submitReply(commentId, replyTextarea.value);
        }
    });
    
    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(submitButton);
    
    replyFormDiv.appendChild(replyTextarea);
    replyFormDiv.appendChild(buttonDiv);
    commentDiv.appendChild(replyFormDiv);
    
    // Add replies if they exist
    if (comment.replies && comment.replies.length > 0) {
        const repliesDiv = document.createElement('div');
        repliesDiv.className = 'replies';
        
        comment.replies.forEach(reply => {
            // Check if this is a nested reply
            const isNested = reply.parent_reply_id !== undefined;
            let replyElement;
            
            if (isNested) {
                // This is a nested reply
                replyElement = createCommentElement(reply, true, comment._id || comment.id);
                replyElement.classList.add('nested-reply');
            } else {
                // This is a regular reply
                replyElement = createCommentElement(reply, true, comment._id || comment.id);
            }
            
            repliesDiv.appendChild(replyElement);
        });
        
        commentDiv.appendChild(repliesDiv);
    }
    
    return commentDiv;
}

function processRedactedText(originalText, editedText) {
    //check if similar
    if (originalText === editedText) {
        return originalText;
    }

    const originalWords = originalText.split(/\s+/);
    const editedWords = editedText.split(/\s+/);
    
    const keepOriginal = Array(originalWords.length).fill(false);

    let lastMatchIndex = -1;
    
    for (const editedWord of editedWords) {
        for (let i = lastMatchIndex + 1; i < originalWords.length; i++) {
            if (originalWords[i] === editedWord && !keepOriginal[i]) {
                keepOriginal[i] = true;
                lastMatchIndex = i;
                break;
            }
        }
    }
    return originalWords.map((word, i) => 
        keepOriginal[i] ? word : '█'.repeat(word.length)
    ).join(' ');
}

// Toggle reply form visibility
function toggleReplyForm(commentId, isReplyToReply = false, parentCommentId = null) {
    const replyForm = document.getElementById(`reply-form-${commentId}`);
    
    if (replyForm.style.display === 'block') {
        replyForm.style.display = 'none';
    } else {
        replyForm.style.display = 'block';
        
        // Store whether this is a reply to a reply
        replyForm.dataset.isReplyToReply = isReplyToReply;
        if (parentCommentId) {
            replyForm.dataset.parentCommentId = parentCommentId;
        }
        
        // Focus on the textarea
        const textarea = replyForm.querySelector('.reply-textarea');
        textarea.focus();
    }
}

// Submit a reply to a comment
async function submitReply(parentId, text) {
    if (!text.trim()) return;
      // Get the exact article title currently displayed in the sidebar
    const articleTitle = document.getElementById('comment-article-title').textContent;
    
    try {
        const response = await fetch(`/api/comments/${parentId}/replies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text
            })
        });
          if (response.ok) {
            const result = await response.json();
            console.log('Reply added successfully:', result);
              // Refresh comments to show the new reply - always get the current article title
            const currentArticleTitle = document.getElementById('comment-article-title').textContent;
            await fetchComments(currentArticleTitle);
            
            // Update comment count by fetching from the server
            try {
                const countResponse = await fetch(`/api/comment-count/${encodeURIComponent(currentArticleTitle)}`);
                if (countResponse.ok) {
                    const data = await countResponse.json();
                    const commentCountElem = document.getElementById('comment-count');
                    commentCountElem.textContent = `(${data.count})`;
                }
            } catch (error) {
                console.error('Error updating comment count:', error);
            }
            
            // Hide the reply form
            const replyForm = document.getElementById(`reply-form-${parentId}`);
            if (replyForm) {
                replyForm.style.display = 'none';
            }
        } else {
            if (response.status === 401) {
                alert('Please log in to add a reply');
                window.location.href = '/login';
            } else {
                console.error('Failed to submit reply:', response.status);
                alert('Failed to add reply. Please try again.');
            }
        }
    } catch (error) {
        console.error('Error submitting reply:', error);
        alert('Error adding reply. Please check your connection.');
    }
}

// Add a new function to handle nested replies
async function submitNestedReply(parentCommentId, replyId, text) {
    if (!text.trim()) return;
    
    try {
        const response = await fetch(`/api/comments/${parentCommentId}/replies/${replyId}/replies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text
            })
        });
        
        if (response.ok) {
            // Refresh comments to show the new nested reply
            const currentArticleTitle = document.getElementById('comment-article-title').textContent;
            await fetchComments(currentArticleTitle);
            
            // Hide the reply form
            const replyForm = document.getElementById(`reply-form-${replyId}`);
            if (replyForm) {
                replyForm.style.display = 'none';
            }
            
            // Update comment count
            try {
                const countResponse = await fetch(`/api/comment-count/${encodeURIComponent(currentArticleTitle)}`);
                if (countResponse.ok) {
                    const data = await countResponse.json();
                    const commentCountElem = document.getElementById('comment-count');
                    commentCountElem.textContent = `(${data.count})`;
                    
                    // Also update article grid count
                    updateArticleCommentCounts(currentArticleTitle, data.count);
                }
            } catch (error) {
                console.error('Error updating comment count:', error);
            }
        } else {
            if (response.status === 401) {
                alert('Please log in to reply');
                window.location.href = '/login';
            } else {
                console.error('Failed to submit nested reply:', response.status);
                alert('Failed to add reply. Please try again.');
            }
        }
    } catch (error) {
        console.error('Error submitting nested reply:', error);
        alert('Error adding reply. Please check your connection.');
    }
}

// Setup event handlers for the comment sidebar
function setupCommentEventHandlers(articleTitle) {
    const commentSidebar = document.getElementById('comment-sidebar');
    const closeButton = commentSidebar.querySelector('.comment-close-button');
    const textarea = document.getElementById('comment-textarea');
    const buttonsDiv = document.getElementById('comment-buttons');
    const submitButton = document.getElementById('comment-submit');
    const cancelButton = document.getElementById('comment-cancel');
    
    // Close button event
    closeButton.addEventListener('click', () => {
        commentSidebar.style.display = 'none';
    });
    
    // Close sidebar when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === commentSidebar) {
            commentSidebar.style.display = 'none';
        }
    });
    
    // Show/hide buttons based on textarea content
    textarea.addEventListener('input', () => {
        if (textarea.value.trim()) {
            buttonsDiv.style.display = 'flex';
        } else {
            buttonsDiv.style.display = 'none';
        }
    });
    
    // Submit comment event
    submitButton.addEventListener('click', () => {
        const commentText = textarea.value.trim();
        
        if (commentText) {
            submitComment(articleTitle, commentText);
            textarea.value = '';
            buttonsDiv.style.display = 'none';
        }
    });
    
    // Cancel comment event
    cancelButton.addEventListener('click', () => {
        textarea.value = '';
        buttonsDiv.style.display = 'none';
    });
}

// Submit a new comment for an article
async function submitComment(articleTitle, text) {
    if (!text.trim()) return;
    
    try {
        // Always get the current article title from the DOM element to ensure consistency
        const currentArticleTitle = document.getElementById('comment-article-title').textContent;
        
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // Don't encode here - the backend will handle it
                articleTitle: currentArticleTitle, // FIXED: removed encodeURIComponent
                text: text
            })
        });
        
        if (response.ok) {
            const result = await response.json();            console.log('Comment added successfully:', result);
              // Refresh comments - this will update the comment list
            const currentArticleTitle = document.getElementById('comment-article-title').textContent;
            await fetchComments(currentArticleTitle);
            
            // Update comment count by fetching from the server
            try {
                const countResponse = await fetch(`/api/comment-count/${encodeURIComponent(currentArticleTitle)}`);
                if (countResponse.ok) {
                    const data = await countResponse.json();
                    const commentCountElem = document.getElementById('comment-count');
                    commentCountElem.textContent = `(${data.count})`;
                }
            } catch (error) {
                console.error('Error updating comment count:', error);
            }
        } else {
            if (response.status === 401) {
                alert('Please log in to comment');
                window.location.href = '/login';
            } else {
                console.error('Failed to submit comment:', response.status);
                alert('Failed to add comment. Please try again.');
            }
        }
    } catch (error) {
        console.error('Error submitting comment:', error);
        alert('Error adding comment. Please check your connection.');
    }
}

// Delete a comment
async function deleteComment(commentId) {
    if (!confirm('Are you sure you want to remove this comment?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            // Update the UI to show the removed message
            const commentElement = document.querySelector(`.comment[data-id="${commentId}"] .comment-text`);
            if (commentElement) {
                commentElement.textContent = "[Comment removed by a moderator]";
                commentElement.style.color = 'dark gray';
                commentElement.classList.add('removed');
            }
            
            const currentArticleTitle = document.getElementById('comment-article-title').textContent;
            
            await fetchComments(currentArticleTitle);
            
            // Update comment count in sidebar
            try {
                const countResponse = await fetch(`/api/comment-count/${encodeURIComponent(currentArticleTitle)}`);
                if (countResponse.ok) {
                    const data = await countResponse.json();
                    const commentCountElem = document.getElementById('comment-count');
                    commentCountElem.textContent = `(${data.count})`;
                    
                    // Also update article grid count
                    updateArticleCommentCounts(currentArticleTitle, data.count);
                }
            } catch (error) {
                console.error('Error updating comment count:', error);
            }
        } else {
            // Error handling code...
        }
    } catch (error) {
        console.error('Error removing comment:', error);
        alert('Error removing comment. Please check your connection.');
    }
}

// Add this function to handle reply deletion
async function deleteReply(commentId, replyId) {
    if (!confirm('Are you sure you want to remove this reply?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}/replies/${replyId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            // Update the UI to show the removed message
            const replyElement = document.querySelector(`.comment[data-id="${replyId}"] .comment-text`);
            if (replyElement) {
                replyElement.textContent = "[Comment removed by a moderator]";  
                replyElement.style.color = 'dark gray';
                replyElement.classList.add('removed');
            }
        } else {
            // Error handling remains the same
            if (response.status === 401) {
                alert('Please log in to remove replies');
                window.location.href = '/login';
            } else if (response.status === 403) {
                alert('Only moderators can remove replies');
            } else {
                console.error('Failed to remove reply:', response.status);
                alert('Failed to remove reply. Please try again.');
            }
        }
    } catch (error) {
        console.error('Error removing reply:', error);
        alert('Error removing reply. Please check your connection.');
    }
}

// Redact a comment
async function redactComment(commentId) {
    // Get the comment element and text
    const commentElement = document.querySelector(`.comment[data-id="${commentId}"] .comment-text`);
    if (!commentElement) return;
    
    const originalText = commentElement.textContent;
    
    // Replace the text with an editable textarea
    const textareaContainer = document.createElement('div');
    textareaContainer.className = 'redact-editor';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'redact-textarea';
    textarea.value = originalText;
    textareaContainer.appendChild(textarea);
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'redact-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'redact-cancel-btn';
    
    const submitButton = document.createElement('button');
    submitButton.textContent = 'Submit Redaction';
    submitButton.className = 'redact-submit-btn';
    
    buttonsDiv.appendChild(cancelButton);
    buttonsDiv.appendChild(submitButton);
    textareaContainer.appendChild(buttonsDiv);
    
    // Replace the comment text with our editor
    commentElement.innerHTML = '';
    commentElement.appendChild(textareaContainer);
    
    // Focus the textarea
    textarea.focus();
    
    // Cancel button restores original text
    cancelButton.addEventListener('click', () => {
        commentElement.textContent = originalText;
    });
    
    // Submit button processes and saves redacted text
    submitButton.addEventListener('click', async () => {
        const editedText = textarea.value;
    
        const redactedText = processRedactedText(originalText, editedText);
        
        try {
            const response = await fetch(`/api/comments/${commentId}/partial-redact`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    redactedText: redactedText
                })
            });
            
            if (response.ok) {
                // Update the UI with the redacted text
                commentElement.textContent = redactedText;
                commentElement.classList.add('partially-redacted');
            } else {
                if (response.status === 401) {
                    alert('Please log in to redact comments');
                    window.location.href = '/login';
                } else if (response.status === 403) {
                    alert('Only moderators can redact comments');
                } else {
                    console.error('Failed to redact comment:', response.status);
                    alert('Failed to redact comment. Please try again.');
                    commentElement.textContent = originalText;
                }
            }
        } catch (error) {
            console.error('Error redacting comment:', error);
            alert('Error redacting comment. Please check your connection.');
            commentElement.textContent = originalText;
        }
    });
}

// Replace the redactReply function with this version
async function redactReply(commentId, replyId) {
    // Get the reply element and text
    const replyElement = document.querySelector(`.comment[data-id="${replyId}"] .comment-text`);
    if (!replyElement) return;
    
    const originalText = replyElement.textContent;
    
    // Replace the text with an editable textarea
    const textareaContainer = document.createElement('div');
    textareaContainer.className = 'redact-editor';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'redact-textarea';
    textarea.value = originalText;
    textareaContainer.appendChild(textarea);
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'redact-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'redact-cancel-btn';
    
    const submitButton = document.createElement('button');
    submitButton.textContent = 'Submit Redaction';
    submitButton.className = 'redact-submit-btn';
    
    buttonsDiv.appendChild(cancelButton);
    buttonsDiv.appendChild(submitButton);
    textareaContainer.appendChild(buttonsDiv);
    
    // Replace the reply text with our editor
    replyElement.innerHTML = '';
    replyElement.appendChild(textareaContainer);
    
    // Focus the textarea
    textarea.focus();
    
    // Cancel button restores original text
    cancelButton.addEventListener('click', () => {
        replyElement.textContent = originalText;
    });
    
    // Submit button processes and saves redacted text
    submitButton.addEventListener('click', async () => {
        const editedText = textarea.value;
        
        // Process the edited text, replacing deleted parts with block characters
        const redactedText = processRedactedText(originalText, editedText);
        
        try {
            const response = await fetch(`/api/comments/${commentId}/replies/${replyId}/partial-redact`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    redactedText: redactedText
                })
            });
            
            if (response.ok) {
                // Update the UI with the redacted text
                replyElement.textContent = redactedText;
                replyElement.classList.add('partially-redacted');
            } else {
                if (response.status === 401) {
                    alert('Please log in to redact replies');
                    window.location.href = '/login';
                } else if (response.status === 403) {
                    alert('Only moderators can redact replies');
                } else {
                    console.error('Failed to redact reply:', response.status);
                    alert('Failed to redact reply. Please try again.');
                    replyElement.textContent = originalText;
                }
            }
        } catch (error) {
            console.error('Error redacting reply:', error);
            alert('Error redacting reply. Please check your connection.');
            replyElement.textContent = originalText;
        }
    });
}

// Load on load
document.addEventListener('DOMContentLoaded', () => {
    fetchNYTData();
    window.addEventListener('scroll', checkScroll);
    
    // Always setup profile sidebar to handle mobile button clicks
    setupProfileSidebar();
    
    // Setup comment sidebar close functionality
    const commentSidebar = document.getElementById('comment-sidebar');
    const commentCloseButton = document.querySelector('.comment-close-button');
    
    commentCloseButton.addEventListener('click', () => {
        commentSidebar.style.display = 'none';
    });
    
    // Add input listener to comment textarea
    const commentTextarea = document.getElementById('comment-textarea');
    const commentButtons = document.getElementById('comment-buttons');
    
    commentTextarea.addEventListener('input', () => {
        if (commentTextarea.value.trim()) {
            commentButtons.style.display = 'flex';
        } else {
            commentButtons.style.display = 'none';
        }
    });
    
    // User info fetch (to check if logged in)
    const loginButton = document.getElementById('login-button');
    const profileButton = document.getElementById('profile-button');
    const profileUsername = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    const mobileProfileButton = document.getElementById('mobile-profile-button');
    
    fetch('/api/user')
        .then(response => response.json())
        .then(data => {
            console.log("User data received:", data);
            if (data.username) {
                // Store moderator status
                isUserModerator = Boolean(data.is_moderator);
                console.log("Moderator status set to:", isUserModerator);
                
                // Hide login button and show profile button
                if (loginButton) loginButton.style.display = 'none';
                if (profileButton) profileButton.style.display = 'inline-block';
                
                // Update mobile profile button appearance
                if (mobileProfileButton) {
                    mobileProfileButton.classList.add('logged-in');
                    mobileProfileButton.title = `Signed in as ${data.username}`;
                }
                
                // If user is a moderator, display that in the profile
                if (isUserModerator && profileUsername) {
                    profileUsername.textContent = data.username + " (Moderator)";
                    console.log("Updated profile username with moderator status");
                }
                
                // Get full user details for the profile sidebar
                fetch('/api/user-details')
                    .then(response => response.json())
                    .then(userData => {
                        if (profileUsername) {
                            profileUsername.textContent = userData.username || 'User';
                        }
                        
                        if (profileEmail) {
                            if (userData.email) {
                                profileEmail.textContent = userData.email;
                            } else {
                                profileEmail.textContent = 'No email provided';
                            }
                        }
                    })
                    .catch(error => {
                        if (profileUsername) profileUsername.textContent = data.username || 'User';
                        if (profileEmail) profileEmail.textContent = 'Email not available';
                        console.error('Error fetching user details:', error);
                    });
            }
        })
        .catch(error => console.error('Error fetching user info:', error));
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    estimateReadTime,
    fetchApiKey,
    fetchNYTData,
    displayArticles,
    checkScroll,
    openCommentSidebar,
    setupCommentEventHandlers,
    submitComment
  };
}