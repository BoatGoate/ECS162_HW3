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

// Estimate reading time based on word count
function estimateReadTime(wordCount) {
    // Avg WPM is 225
    const wordsPerMinute = 225;
    const minutes = Math.round(wordCount / wordsPerMinute);
    return `${minutes} MIN READ`;
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
function displayArticles(articles, clearExisting = false) {
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
        articleDiv.appendChild(readTime);
        
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

// Load on load
document.addEventListener('DOMContentLoaded', () => {
    fetchNYTData();
    window.addEventListener('scroll', checkScroll);
    
    // Always setup profile sidebar to handle mobile button clicks
    setupProfileSidebar();
    
    // User info fetch (to check if logged in)
    const loginButton = document.getElementById('login-button');
    const profileButton = document.getElementById('profile-button');
    const profileUsername = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    const mobileProfileButton = document.getElementById('mobile-profile-button');
    
    fetch('/api/user')
        .then(response => response.json())
        .then(data => {
            if (data.username) {
                // Hide login button and show profile button
                if (loginButton) loginButton.style.display = 'none';
                if (profileButton) profileButton.style.display = 'inline-block';
                
                // Update mobile profile button appearance
                if (mobileProfileButton) {
                    mobileProfileButton.classList.add('logged-in');
                    mobileProfileButton.title = `Signed in as ${data.username}`;
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
    checkScroll
  };
}