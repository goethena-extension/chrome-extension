document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggleBtn');
    const videoSpeedBtn = document.getElementById('videoSpeedBtn');
    const autoAnswersBtn = document.getElementById('autoAnswersBtn');
    const statusDiv = document.getElementById('status');
    
    let isActive = false;
    let videoSpeedEnabled = true;
    let autoAnswersEnabled = true;
    
    // Check actual status when popup opens
    checkCurrentStatus();
    
    toggleBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            
            // Check if we're on the right domain
            if (!tab.url.includes('app.goethena.com')) {
                alert('This extension only works on app.goethena.com pages. Please navigate to a GoEthena training page first.');
                return;
            }
            
            // Send message to content script
            chrome.tabs.sendMessage(tab.id, {action: 'toggle'}, function(response) {
                if (chrome.runtime.lastError) {
                    console.log('Error:', chrome.runtime.lastError.message);
                    // Try to inject the content script if it's not loaded
                    chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        files: ['content.js']
                    }, function() {
                        if (chrome.runtime.lastError) {
                            alert('Failed to load the auto clicker. Please refresh the page and try again.');
                        } else {
                            // Try again after injection
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tab.id, {action: 'toggle'}, function(response) {
                                    if (response) {
                                        isActive = response.status;
                                        updateUI();
                                    }
                                });
                            }, 100);
                        }
                    });
                } else if (response) {
                    isActive = response.status;
                    updateUI();
                }
            });
        });
    });
    
    videoSpeedBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            
            // Send message to content script
            chrome.tabs.sendMessage(tab.id, {action: 'toggleVideoSpeed'}, function(response) {
                if (response && response.videoSpeedEnabled !== undefined) {
                    videoSpeedEnabled = response.videoSpeedEnabled;
                    updateVideoSpeedButton();
                }
            });
        });
    });
    
    autoAnswersBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            
            // Send message to content script
            chrome.tabs.sendMessage(tab.id, {action: 'toggleAutoAnswers'}, function(response) {
                if (response && response.autoAnswersEnabled !== undefined) {
                    autoAnswersEnabled = response.autoAnswersEnabled;
                    updateAutoAnswersButton();
                }
            });
        });
    });
    
    function updateUI() {
        if (isActive) {
            statusDiv.textContent = 'Status: Active';
            statusDiv.className = 'status active';
            toggleBtn.textContent = 'Stop Auto Clicker';
        } else {
            statusDiv.textContent = 'Status: Inactive';
            statusDiv.className = 'status inactive';
            toggleBtn.textContent = 'Start Auto Clicker';
        }
        updateVideoSpeedButton();
        updateAutoAnswersButton();
    }
    
    function updateVideoSpeedButton() {
        videoSpeedBtn.textContent = `Video Speed: ${videoSpeedEnabled ? 'ON' : 'OFF'}`;
        videoSpeedBtn.style.background = videoSpeedEnabled ? '#28a745' : '#6c757d';
    }
    
    function updateAutoAnswersButton() {
        autoAnswersBtn.textContent = `Auto Answers: ${autoAnswersEnabled ? 'ON' : 'OFF'}`;
        autoAnswersBtn.style.background = autoAnswersEnabled ? '#28a745' : '#dc3545';
    }
    
    function checkCurrentStatus() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            
            // Check if we're on the right domain
            if (!tab.url.includes('app.goethena.com')) {
                isActive = false;
                updateUI();
                return;
            }
            
            // Send message to content script to get current status
            chrome.tabs.sendMessage(tab.id, {action: 'getStatus'}, function(response) {
                if (chrome.runtime.lastError) {
                    // Content script not loaded or no response
                    isActive = false;
                    videoSpeedEnabled = true;
                    autoAnswersEnabled = true;
                } else if (response) {
                    isActive = response.status || false;
                    videoSpeedEnabled = response.videoSpeedEnabled !== undefined ? response.videoSpeedEnabled : true;
                    autoAnswersEnabled = response.autoAnswersEnabled !== undefined ? response.autoAnswersEnabled : true;
                } else {
                    isActive = false;
                    videoSpeedEnabled = true;
                    autoAnswersEnabled = true;
                }
                updateUI();
            });
        });
    }
}); 