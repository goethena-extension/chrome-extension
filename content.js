// GoEthena Auto Clicker Content Script
console.log('GoEthena Auto Clicker loaded');

class GoEthenaAutoClicker {
    constructor() {
        this.isRunning = false;
        this.scrollSpeed = 1000; // ms between scroll attempts
        this.clickDelay = 2000; // ms delay between clicks
        this.clickedAnswers = new Set(); // Track clicked answers
        this.lastQuestionText = ''; // Track when we're on a new question
        this.answerClickCount = 0; // Count clicks for current question
        this.maxAnswerClicks = 5; // Max clicks per question before moving to submit
        this.videoSpeedEnabled = true; // Enable video speed control by default
        this.autoAnswersEnabled = true; // Enable auto answers by default
        this.pageFullyScrolled = false; // Track if page is fully scrolled
        this.scrollFailureCount = 0; // Track consecutive scroll failures
        this.interceptedQuestionData = new Map(); // Store intercepted question data
        this.init();
    }

    init() {
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle') {
                this.toggle();
                sendResponse({ status: this.isRunning });
            } else if (request.action === 'getStatus') {
                sendResponse({ 
                    status: this.isRunning,
                    videoSpeedEnabled: this.videoSpeedEnabled,
                    autoAnswersEnabled: this.autoAnswersEnabled
                });
            } else if (request.action === 'toggleVideoSpeed') {
                this.videoSpeedEnabled = !this.videoSpeedEnabled;
                if (this.videoSpeedEnabled) {
                    this.addVideoSpeedControls();
                } else {
                    this.removeVideoSpeedControls();
                }
                sendResponse({ videoSpeedEnabled: this.videoSpeedEnabled });
            } else if (request.action === 'toggleAutoAnswers') {
                this.autoAnswersEnabled = !this.autoAnswersEnabled;
                console.log('Auto answers', this.autoAnswersEnabled ? 'enabled' : 'disabled');
                sendResponse({ autoAnswersEnabled: this.autoAnswersEnabled });
            }
        });

        // Add video speed controls on load
        this.addVideoSpeedControls();
        
        // Set up network interception for question data
        this.setupNetworkInterception();
        
        // Don't auto-start - user must manually enable after page refresh
        console.log('GoEthena Auto Clicker ready - click the extension icon to start');
    }

    setupNetworkInterception() {
        try {
            // Store intercepted question data
            this.interceptedQuestionData = new Map();
            
            // Intercept fetch requests
            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                
                // Check if this is a question/slide related request
                const url = args[0];
                if (typeof url === 'string' && (
                    url.includes('/api/') || 
                    url.includes('slide') || 
                    url.includes('question') ||
                    url.includes('assignment')
                )) {
                    // Clone response to avoid consuming it
                    const clonedResponse = response.clone();
                    
                    try {
                        const data = await clonedResponse.json();
                        this.processInterceptedData(data, url);
                    } catch (e) {
                        // Not JSON, ignore
                    }
                }
                
                return response;
            };
            
            // Intercept XMLHttpRequest
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;
            
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                this._url = url;
                return originalXHROpen.call(this, method, url, ...args);
            };
            
            XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', () => {
                    if (this._url && (
                        this._url.includes('/api/') || 
                        this._url.includes('slide') || 
                        this._url.includes('question') ||
                        this._url.includes('assignment')
                    )) {
                        try {
                            const data = JSON.parse(this.responseText);
                            autoClicker.processInterceptedData(data, this._url);
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                });
                
                return originalXHRSend.call(this, ...args);
            };
            
            console.log('🌐 Network interception set up for question data');
            
        } catch (error) {
            console.log('Error setting up network interception:', error);
        }
    }

    processInterceptedData(data, url) {
        try {
            console.log('🌐 Processing intercepted data from:', url);
            
            // Look for question data in the response
            const questionData = this.searchObjectForQuestionData(data);
            if (questionData) {
                console.log('📊 Found question data in network response');
                
                // Store the data with a timestamp
                const key = this.generateQuestionKey(questionData);
                this.interceptedQuestionData.set(key, {
                    data: questionData,
                    timestamp: Date.now(),
                    url: url
                });
                
                // Cleanup old data (keep only last 10 minutes)
                this.cleanupOldInterceptedData();
                
                console.log('📝 Stored question data for future use');
            }
            
        } catch (error) {
            console.log('Error processing intercepted data:', error);
        }
    }

    searchObjectForQuestionData(obj) {
        try {
            const maxDepth = 10;
            
            const search = (obj, depth) => {
                if (!obj || depth > maxDepth || typeof obj !== 'object') return null;
                
                // Look for question data structure with answers
                if (obj.question && obj.question.orderedAnswers) {
                    const answers = obj.question.orderedAnswers;
                    if (Array.isArray(answers) && answers.some(a => a.hasOwnProperty('isCorrectAnswer'))) {
                        return {
                            question: obj.question,
                            answers: answers,
                            slideId: obj.slideId,
                            nudgeId: obj.nudgeId
                        };
                    }
                }
                
                // Look for direct answers array
                if (obj.orderedAnswers || obj.answers) {
                    const answers = obj.orderedAnswers || obj.answers;
                    if (Array.isArray(answers) && answers.some(a => a.hasOwnProperty('isCorrectAnswer'))) {
                        return {
                            answers: answers,
                            slideId: obj.slideId,
                            nudgeId: obj.nudgeId
                        };
                    }
                }
                
                // Look for slide data with question
                if (obj.orderedSlides && Array.isArray(obj.orderedSlides)) {
                    for (const slide of obj.orderedSlides) {
                        if (slide.question && slide.question.orderedAnswers) {
                            const answers = slide.question.orderedAnswers;
                            if (Array.isArray(answers) && answers.some(a => a.hasOwnProperty('isCorrectAnswer'))) {
                                return {
                                    question: slide.question,
                                    answers: answers,
                                    slideId: slide.slideId,
                                    nudgeId: slide.nudgeId
                                };
                            }
                        }
                    }
                }
                
                // Recursive search
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const found = search(item, depth + 1);
                        if (found) return found;
                    }
                } else {
                    for (const key in obj) {
                        try {
                            const found = search(obj[key], depth + 1);
                            if (found) return found;
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                return null;
            };
            
            return search(obj, 0);
        } catch (error) {
            console.log('Error searching for question data:', error);
            return null;
        }
    }

    generateQuestionKey(questionData) {
        // Generate a unique key for the question based on its content
        const questionText = questionData.question?.content || questionData.question?.text || '';
        const answersText = questionData.answers?.map(a => a.content || a.text).join('|') || '';
        return `q_${questionText.substring(0, 50)}_${answersText.substring(0, 100)}`.replace(/\s+/g, '_');
    }

    cleanupOldInterceptedData() {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        for (const [key, data] of this.interceptedQuestionData) {
            if (data.timestamp < tenMinutesAgo) {
                this.interceptedQuestionData.delete(key);
            }
        }
    }

    findAnswerFromInterceptedData() {
        try {
            console.log('🔍 Searching intercepted network data...');
            
            // Get current question text to match with intercepted data
            const currentQuestionText = this.extractQuestionText();
            if (!currentQuestionText) {
                console.log('No current question text found');
                return null;
            }
            
            // Search through intercepted data for matching question
            for (const [key, data] of this.interceptedQuestionData) {
                const storedQuestionText = data.data.question?.content || data.data.question?.text || '';
                
                // Check if this matches the current question
                if (this.questionsMatch(currentQuestionText, storedQuestionText)) {
                    console.log('📊 Found matching question in intercepted data');
                    
                    // Find the correct answer
                    const correctAnswer = data.data.answers.find(a => a.isCorrectAnswer === true);
                    if (correctAnswer) {
                        console.log('🎯 Found correct answer from intercepted data:', correctAnswer.content);
                        return this.findAnswerElementByContent(correctAnswer.content);
                    }
                }
            }
            
            console.log('No matching question found in intercepted data');
            return null;
            
        } catch (error) {
            console.log('Error searching intercepted data:', error);
            return null;
        }
    }

    questionsMatch(text1, text2) {
        if (!text1 || !text2) return false;
        
        // Clean and normalize text for comparison
        const clean1 = text1.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const clean2 = text2.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Direct match
        if (clean1 === clean2) return true;
        
        // Partial match (one contains the other)
        if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
        
        // Similarity check (at least 70% of words in common)
        const words1 = clean1.split(' ').filter(w => w.length > 3);
        const words2 = clean2.split(' ').filter(w => w.length > 3);
        
        if (words1.length === 0 || words2.length === 0) return false;
        
        const commonWords = words1.filter(w => words2.includes(w));
        const similarity = commonWords.length / Math.max(words1.length, words2.length);
        
        return similarity >= 0.7;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('GoEthena Auto Clicker started');
        this.run();
    }

    stop() {
        this.isRunning = false;
        console.log('GoEthena Auto Clicker stopped');
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    async run() {
        while (this.isRunning) {
            try {
                console.log('Auto clicker cycle starting...');
                
                // Reset tracking if we're on a new question
                this.checkForNewQuestion();
                
                // Check for Try Again button first (after incorrect answers)
                if (await this.clickTryAgainButton()) {
                    console.log('Clicked Try Again, will try next answer...');
                    // Don't fully reset - just allow trying next answer
                    await this.delay(this.clickDelay);
                    continue;
                }
                
                // Scroll down first to reveal content (unless already fully scrolled)
                if (!this.pageFullyScrolled) {
                    console.log('Scrolling down to reveal content...');
                    const scrollWorked = await this.scrollDown();
                    if (!scrollWorked) {
                        console.log('Standard scroll failed, trying alternative methods...');
                        await this.alternativeScroll();
                        this.scrollFailureCount++;
                        
                        // If we've failed to scroll multiple times, assume page is fully scrolled
                        if (this.scrollFailureCount >= 3) {
                            console.log('Multiple scroll failures detected - assuming page is fully scrolled');
                            this.pageFullyScrolled = true;
                        }
                    } else {
                        // Reset failure count on successful scroll
                        this.scrollFailureCount = 0;
                    }
                    await this.delay(1000); // Short delay to let content load
                } else {
                    console.log('Page fully scrolled - skipping scroll attempt');
                }
                
                // Check for Continue button (after correct answers)
                if (await this.clickContinueButton()) {
                    console.log('Clicked Continue, waiting...');
                    this.resetAnswerTracking(); // Reset for next question (includes scroll reset)
                    await this.delay(this.clickDelay);
                    continue;
                }

                // Check for answer options, but only if auto answers is enabled
                if (this.autoAnswersEnabled && this.answerClickCount < this.maxAnswerClicks && await this.clickAnswerOptions()) {
                    console.log('Clicked answer option, now trying to submit...');
                    this.answerClickCount++;
                    await this.delay(this.clickDelay);
                    
                    // Immediately try to submit after clicking an answer (auto answers enabled)
                    if (await this.clickSubmitButton()) {
                        console.log('Clicked Submit after selecting answer, waiting...');
                        // Don't reset tracking yet - we might need to try again if wrong
                        await this.delay(this.clickDelay * 2); // Longer delay after submit
                        continue;
                    }
                    continue;
                } else if (!this.autoAnswersEnabled && this.answerClickCount === 0) {
                    console.log('Auto answers disabled - skipping answer selection and submit');
                    this.answerClickCount = this.maxAnswerClicks; // Prevent repeated logging
                }

                // Try to submit if no more answers to click (fallback) - only if auto answers is enabled
                if (this.autoAnswersEnabled && await this.clickSubmitButton()) {
                    console.log('Clicked Submit (fallback), waiting...');
                    this.resetAnswerTracking(); // Reset for next question
                    await this.delay(this.clickDelay * 2); // Longer delay after submit
                    continue;
                }

                // Wait before next cycle
                await this.delay(this.scrollSpeed);

            } catch (error) {
                console.error('Error in auto clicker:', error);
                await this.delay(this.scrollSpeed);
            }
        }
    }

    checkForNewQuestion() {
        // Look for question text to detect if we're on a new question
        const questionElements = document.querySelectorAll('h1, h2, h3, .question, [role="heading"]');
        let currentQuestionText = '';
        
        for (const element of questionElements) {
            const text = element.textContent || '';
            if (text.length > 10 && !text.includes('Incorrect!') && !text.includes('Try Again')) { 
                currentQuestionText = text;
                break;
            }
        }
        
        // Also check main content areas for questions
        if (!currentQuestionText) {
            const contentElements = document.querySelectorAll('p, div');
            for (const element of contentElements) {
                const text = element.textContent || '';
                if (text.includes('?') && text.length > 10 && !text.includes('Incorrect!')) {
                    currentQuestionText = text.substring(0, 100); // First 100 chars
                    break;
                }
            }
        }
        
        // If question changed, reset tracking
        if (currentQuestionText !== this.lastQuestionText && currentQuestionText !== '') {
            console.log('New question detected, resetting answer tracking');
            this.resetAnswerTracking();
            this.lastQuestionText = currentQuestionText;
        }
    }

    resetAnswerTracking() {
        this.clickedAnswers.clear();
        this.answerClickCount = 0;
        this.pageFullyScrolled = false; // Reset scroll tracking for new content
        this.scrollFailureCount = 0; // Reset scroll failure counter
        console.log('Answer tracking reset - will try all answers again');
    }

    async clickTryAgainButton() {
        // Look for Try Again button or similar retry buttons
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
        
        for (const button of buttons) {
            const text = button.textContent || button.value || '';
            const lowerText = text.toLowerCase();
            
            // Look for try again related text
            if (lowerText.includes('try again') ||
                lowerText.includes('retry') ||
                lowerText === 'try again' ||
                lowerText === 'retry') {
                
                // Check if button is visible and enabled
                const isVisible = button.offsetWidth > 0 && button.offsetHeight > 0;
                const isEnabled = !button.disabled;
                
                if (isVisible && isEnabled) {
                    console.log('Found Try Again button:', text);
                    
                    // Reset answer click count so we can try more answers
                    this.answerClickCount = 0;
                    console.log('Reset answer click count, will try next untried answer');
                    
                    // Use the enhanced click method
                    this.triggerClick(button);
                    return true;
                }
            }
        }

        // Also check for "Incorrect" indicators which might have clickable areas
        const incorrectElements = document.querySelectorAll('*');
        for (const element of incorrectElements) {
            const text = element.textContent || '';
            if (text.includes('Incorrect!') || text.includes('Try Again')) {
                // Look for clickable children
                const clickableChildren = element.querySelectorAll('button, [role="button"], [onclick]');
                for (const child of clickableChildren) {
                    const childText = child.textContent || '';
                    if (childText.toLowerCase().includes('try') || childText.toLowerCase().includes('again')) {
                                                 console.log('Found Try Again in incorrect section:', childText);
                        this.answerClickCount = 0;
                        console.log('Reset answer click count, will try next untried answer');
                        this.triggerClick(child);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    async clickContinueButton() {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
        
        for (const button of buttons) {
            const text = button.textContent || button.value || '';
            if (text.toLowerCase().includes('continue') || text.toLowerCase().includes('cont')) {
                
                // Check if button is already enabled
                if (!button.disabled && button.style.pointerEvents !== 'none') {
                    console.log('Found enabled Continue button, clicking immediately...');
                    this.triggerClick(button);
                    return true;
                }
                
                console.log('Found Continue button with timer, attempting lightweight bypass...');
                
                // Try lightweight timer bypass
                await this.bypassContinueTimer(button);
                
                // Check if bypass worked
                if (!button.disabled && button.style.pointerEvents !== 'none') {
                    console.log('Timer bypass successful, clicking...');
                    this.triggerClick(button);
                    return true;
                } else {
                    console.log('Timer still active, will try again next cycle...');
                    return false; // Let it try again next cycle instead of forcing
                }
            }
        }

        return false;
    }

    async bypassContinueTimer(button) {
        try {
            // Method 1: Simple enable button
            button.disabled = false;
            button.removeAttribute('disabled');
            button.classList.remove('disabled', 'loading', 'countdown', 'timer-active');
            
            // Method 2: Force enable button styles
            button.style.pointerEvents = 'auto';
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
            
            // Method 3: Look for timer-related data attributes on this button only
            const attributes = button.getAttributeNames();
            for (const attr of attributes) {
                if (attr.includes('timer') || attr.includes('countdown') || attr.includes('delay')) {
                    try {
                        button.setAttribute(attr, '0');
                    } catch (e) {
                        // Continue
                    }
                }
            }
            
            console.log('Timer bypass completed (lightweight)');
            
        } catch (error) {
            console.log('Error bypassing timer:', error);
        }
    }

    async clickSubmitButton() {
        // Look for Submit Answer button first, regardless of selection state
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
        
        for (const button of buttons) {
            const text = button.textContent || button.value || '';
            const lowerText = text.toLowerCase();
            
            // Look for submit-related text
            if (lowerText.includes('submit') || 
                lowerText.includes('answer') ||
                lowerText === 'submit answer' ||
                lowerText === 'submit') {
                
                // Check if button is visible and enabled
                const isVisible = button.offsetWidth > 0 && button.offsetHeight > 0;
                const isEnabled = !button.disabled;
                
                if (isVisible && isEnabled) {
                    console.log('Found Submit button:', text, 'Visible:', isVisible, 'Enabled:', isEnabled);
                    
                    // Use the enhanced click method
                    this.triggerClick(button);
                    return true;
                }
            }
        }

        // Also look for buttons using text content search
        const submitElements = this.findElementsContainingText('button', 'Submit');
        if (submitElements.length > 0) {
            const button = submitElements[0];
            const isVisible = button.offsetWidth > 0 && button.offsetHeight > 0;
            const isEnabled = !button.disabled;
            
            if (isVisible && isEnabled) {
                console.log('Found Submit button via text search, clicking...');
                this.triggerClick(button);
                return true;
            }
        }

        console.log('No submit button found or button not ready');
        return false;
    }

    hasSelectedAnswers() {
        // Check if any answers are selected
        const selectedElements = document.querySelectorAll(
            'input[type="radio"]:checked, input[type="checkbox"]:checked, ' +
            'button.selected, button.active, div.selected, div.active, ' +
            '[aria-selected="true"], [data-selected="true"]'
        );
        
        // Also check for answer buttons that might have visual selection indicators
        const answerButtons = document.querySelectorAll('button, div[role="button"]');
        for (const button of answerButtons) {
            const text = button.textContent || '';
            if (/^[A-Z]\.\s/.test(text.trim())) {
                if (button.classList.contains('selected') || 
                    button.classList.contains('active') ||
                    button.style.backgroundColor !== '' ||
                    button.getAttribute('aria-selected') === 'true') {
                    return true;
                }
            }
        }
        
        console.log('Selected answers found:', selectedElements.length > 0);
        return selectedElements.length > 0;
    }

    async clickAnswerOptions() {
        // First, try to find the correct answer intelligently
        const intelligentAnswer = await this.findCorrectAnswer();
        if (intelligentAnswer) {
            console.log('Found intelligent answer, clicking:', intelligentAnswer.text.substring(0, 50) + '...');
            this.triggerClick(intelligentAnswer.element);
            
            // Track this answer
            const answerId = this.getAnswerId(intelligentAnswer.text, intelligentAnswer.element);
            this.clickedAnswers.add(answerId);
            
            return true;
        }

        // Fallback to original logic if no intelligent answer found
        // Look for answer options with better detection
        const answerElements = [];
        
        // Method 1: Look for buttons with answer patterns (A., B., C., D., etc.)
        const allButtons = document.querySelectorAll('button, div[role="button"], label, input[type="radio"], input[type="checkbox"]');
        
        for (const element of allButtons) {
            // Try multiple ways to get the text content
            let text = element.textContent || element.innerText || element.value || '';
            
            // If the element doesn't have direct text, check its children
            if (!text || text.length < 3) {
                const textNodes = element.querySelectorAll('*');
                for (const node of textNodes) {
                    const nodeText = node.textContent || node.innerText || '';
                    if (nodeText && nodeText.length > text.length) {
                        text = nodeText;
                    }
                }
            }
            
            // Also check parent elements for text (sometimes answers are in parent containers)
            if (!text || text.length < 3) {
                let parent = element.parentElement;
                if (parent) {
                    const parentText = parent.textContent || parent.innerText || '';
                    if (parentText && parentText.length > 3) {
                        text = parentText;
                    }
                }
            }
            
            const trimmedText = text.trim();
            
            // Check for answer pattern (A., B., C., D., etc.)
            if (/^[A-Z]\.\s/.test(trimmedText)) {
                answerElements.push({
                    element: element,
                    text: trimmedText,
                    type: 'button'
                });
            }
            
            // Check for radio buttons or checkboxes
            if (element.type === 'radio' || element.type === 'checkbox') {
                answerElements.push({
                    element: element,
                    text: trimmedText,
                    type: element.type
                });
            }
        }

        // Method 2: Look for clickable divs that might be answer options
        const clickableDivs = document.querySelectorAll('div[onclick], div[role="button"], div[tabindex]');
        for (const div of clickableDivs) {
            const text = div.textContent || '';
            if (/^[A-Z]\.\s/.test(text.trim()) && !answerElements.some(ae => ae.element === div)) {
                answerElements.push({
                    element: div,
                    text: text.trim(),
                    type: 'div'
                });
            }
        }

        console.log('Found answer elements:', answerElements.length);

        // Sort answers to ensure consistent order (A, B, C, D)
        answerElements.sort((a, b) => {
            const aText = a.text.trim();
            const bText = b.text.trim();
            return aText.localeCompare(bText);
        });

        console.log('Available answers:', answerElements.map((a, i) => `${i}: "${a.text.substring(0, 30)}"`).join(', '));
        console.log('Already tried answers:', Array.from(this.clickedAnswers).join(', '));
        
        // Debug: Show raw element info
        if (answerElements.length > 0) {
            console.log('First element debug:', {
                tagName: answerElements[0].element.tagName,
                textContent: answerElements[0].element.textContent,
                innerText: answerElements[0].element.innerText,
                innerHTML: answerElements[0].element.innerHTML?.substring(0, 100)
            });
        }

        // Click unselected answers with proper event handling
        for (const answerObj of answerElements) {
            const element = answerObj.element;
            const answerText = answerObj.text.trim();
            const shortText = answerText.substring(0, 50);
            
            // Create a unique identifier for this answer
            const answerId = this.getAnswerId(answerText, element);
            
            // Check if we've already clicked this specific answer
            if (this.clickedAnswers.has(answerId)) {
                console.log('Already tried this answer:', shortText + '... (ID:', answerId + ')');
                continue;
            }
            
            // Check if already selected
            const isSelected = element.checked || 
                             element.classList.contains('selected') || 
                             element.classList.contains('active') ||
                             element.getAttribute('aria-selected') === 'true' ||
                             element.getAttribute('data-selected') === 'true';
            
            if (!element.disabled) {
                console.log('Clicking answer option:', shortText + '...');
                
                // Track that we've clicked this answer using the unique ID
                this.clickedAnswers.add(answerId);
                
                // Try multiple click methods to ensure React events are triggered
                this.triggerClick(element);
                
                return true; // Only click one at a time
            }
        }

        return false;
    }

    getAnswerId(answerText, element) {
        // Create a unique identifier for this answer
        let answerId;
        if (answerText.length >= 3 && /^[A-Z]\.\s/.test(answerText)) {
            answerId = answerText.substring(0, 3); // Use first 3 chars (like "A. ", "B. ")
        } else {
            // Fallback: use element position and partial text
            const elementIndex = Array.from(element.parentNode.children).indexOf(element);
            answerId = `${elementIndex}-${answerText.substring(0, 10)}`;
        }
        return answerId;
    }

    async findCorrectAnswer() {
        console.log('🧠 Attempting to find correct answer intelligently...');
        
        try {
            // Method 0: Try to access intercepted network data (MOST reliable)
            const interceptedAnswer = this.findAnswerFromInterceptedData();
            if (interceptedAnswer) {
                console.log('✅ Found answer from intercepted network data:', interceptedAnswer.text.substring(0, 50) + '...');
                return interceptedAnswer;
            }

            // Method 1: Try to access client-side data directly (very reliable)
            const clientDataAnswer = this.findAnswerFromClientData();
            if (clientDataAnswer) {
                console.log('✅ Found answer from client-side data:', clientDataAnswer.text.substring(0, 50) + '...');
                return clientDataAnswer;
            }

            // Get the question text
            const questionText = this.extractQuestionText();
            console.log('Question extracted:', questionText.substring(0, 100) + '...');
            
            // Get all answer options
            const answerOptions = this.extractAnswerOptions();
            if (answerOptions.length === 0) {
                console.log('No answer options found for intelligent analysis');
                return null;
            }
            
            console.log('Found', answerOptions.length, 'answer options for analysis');
            
            // Method 2: Look for hints in page content
            const hintBasedAnswer = this.findAnswerFromHints(questionText, answerOptions);
            if (hintBasedAnswer) {
                console.log('✅ Found answer from hints:', hintBasedAnswer.text.substring(0, 50) + '...');
                return hintBasedAnswer;
            }
            
            // Method 3: Look for patterns in HTML attributes that might reveal correct answer
            const attributeBasedAnswer = this.findAnswerFromAttributes(answerOptions);
            if (attributeBasedAnswer) {
                console.log('✅ Found answer from HTML attributes:', attributeBasedAnswer.text.substring(0, 50) + '...');
                return attributeBasedAnswer;
            }
            
            // Method 4: Look for visual cues (like highlighted text, bold text, etc.)
            const visualBasedAnswer = this.findAnswerFromVisualCues(questionText, answerOptions);
            if (visualBasedAnswer) {
                console.log('✅ Found answer from visual cues:', visualBasedAnswer.text.substring(0, 50) + '...');
                return visualBasedAnswer;
            }
            
            // Method 5: Content analysis - look for matching keywords between question and answers
            const keywordBasedAnswer = this.findAnswerFromKeywordMatching(questionText, answerOptions);
            if (keywordBasedAnswer) {
                console.log('✅ Found answer from keyword matching:', keywordBasedAnswer.text.substring(0, 50) + '...');
                return keywordBasedAnswer;
            }
            
            console.log('❌ No intelligent answer found, falling back to standard approach');
            return null;
            
        } catch (error) {
            console.error('Error in intelligent answer detection:', error);
            return null;
        }
    }

    findAnswerFromClientData() {
        try {
            console.log('🔍 Searching for client-side question data...');
            
            // Method 1: Look for React component data in DOM
            const reactData = this.extractReactData();
            if (reactData) {
                console.log('Found React data with correct answer');
                return reactData;
            }
            
            // Method 2: Scan window objects for question data
            const windowData = this.extractWindowData();
            if (windowData) {
                console.log('Found window data with correct answer');
                return windowData;
            }
            
            // Method 3: Intercept network requests/responses (check if data is cached)
            const cachedData = this.extractCachedData();
            if (cachedData) {
                console.log('Found cached data with correct answer');
                return cachedData;
            }
            
            // Method 4: Look for JSON-LD or embedded JSON data
            const embeddedData = this.extractEmbeddedJsonData();
            if (embeddedData) {
                console.log('Found embedded JSON data with correct answer');
                return embeddedData;
            }
            
            console.log('No client-side data found');
            return null;
            
        } catch (error) {
            console.log('Error accessing client-side data:', error);
            return null;
        }
    }

    extractReactData() {
        try {
            // Look for React fiber data in DOM elements
            const questionElements = document.querySelectorAll('[data-testid*="question"], [class*="question"], [class*="Question"]');
            
            for (const element of questionElements) {
                // Check for React fiber keys (React internal data)
                const keys = Object.keys(element);
                for (const key of keys) {
                    if (key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalInstance') || key.startsWith('__reactFiber')) {
                        try {
                            const fiberNode = element[key];
                            const questionData = this.traverseReactFiber(fiberNode);
                            if (questionData) {
                                return questionData;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
            
            // Look for answer elements with React data
            const answerElements = document.querySelectorAll('button, div[role="button"], input[type="radio"]');
            for (const element of answerElements) {
                const text = element.textContent || '';
                if (/^[A-Z]\.\s/.test(text.trim())) {
                    const keys = Object.keys(element);
                    for (const key of keys) {
                        if (key.startsWith('__react')) {
                            try {
                                const fiberNode = element[key];
                                const answerData = this.traverseReactFiber(fiberNode, text.trim());
                                if (answerData) {
                                    return answerData;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.log('Error extracting React data:', error);
            return null;
        }
    }

    traverseReactFiber(fiberNode, searchText = null) {
        try {
            const maxDepth = 10;
            let depth = 0;
            
            const traverse = (node, currentDepth) => {
                if (!node || currentDepth > maxDepth) return null;
                
                // Check memoizedProps for question/answer data
                if (node.memoizedProps) {
                    const props = node.memoizedProps;
                    
                    // Look for answer arrays with isCorrectAnswer
                    if (props.answers || props.orderedAnswers || props.options) {
                        const answers = props.answers || props.orderedAnswers || props.options;
                        if (Array.isArray(answers)) {
                            const correctAnswer = answers.find(a => a.isCorrectAnswer === true);
                            if (correctAnswer) {
                                console.log('🎯 Found correct answer in React props:', correctAnswer.content || correctAnswer.text);
                                return this.findAnswerElementByContent(correctAnswer.content || correctAnswer.text);
                            }
                        }
                    }
                    
                    // Look for individual answer data
                    if (props.isCorrectAnswer === true && (props.content || props.text)) {
                        console.log('🎯 Found correct answer in React props:', props.content || props.text);
                        return this.findAnswerElementByContent(props.content || props.text);
                    }
                    
                    // Look for question data structure
                    if (props.question && props.question.orderedAnswers) {
                        const correctAnswer = props.question.orderedAnswers.find(a => a.isCorrectAnswer === true);
                        if (correctAnswer) {
                            console.log('🎯 Found correct answer in question props:', correctAnswer.content);
                            return this.findAnswerElementByContent(correctAnswer.content);
                        }
                    }
                }
                
                // Check memoizedState for component state
                if (node.memoizedState) {
                    const state = node.memoizedState;
                    if (state.memoizedState && Array.isArray(state.memoizedState)) {
                        for (const stateItem of state.memoizedState) {
                            if (stateItem && Array.isArray(stateItem)) {
                                const correctAnswer = stateItem.find(a => a && a.isCorrectAnswer === true);
                                if (correctAnswer) {
                                    console.log('🎯 Found correct answer in React state:', correctAnswer.content);
                                    return this.findAnswerElementByContent(correctAnswer.content);
                                }
                            }
                        }
                    }
                }
                
                // Traverse child and sibling nodes
                if (node.child) {
                    const result = traverse(node.child, currentDepth + 1);
                    if (result) return result;
                }
                
                if (node.sibling) {
                    const result = traverse(node.sibling, currentDepth + 1);
                    if (result) return result;
                }
                
                return null;
            };
            
            return traverse(fiberNode, depth);
        } catch (error) {
            console.log('Error traversing React fiber:', error);
            return null;
        }
    }

    findAnswerElementByContent(content) {
        if (!content) return null;
        
        try {
            // Find answer elements and match content
            const answerElements = document.querySelectorAll('button, div[role="button"], label, input[type="radio"], input[type="checkbox"]');
            
            for (const element of answerElements) {
                const elementText = element.textContent || element.innerText || '';
                
                // Direct match
                if (elementText.includes(content)) {
                    return {
                        element: element,
                        text: elementText.trim(),
                        confidence: 'high'
                    };
                }
                
                // Partial match (remove A., B., etc.)
                const cleanElementText = elementText.replace(/^[A-Z]\.\s/, '').trim();
                const cleanContent = content.replace(/^[A-Z]\.\s/, '').trim();
                
                if (cleanElementText === cleanContent || cleanElementText.includes(cleanContent) || cleanContent.includes(cleanElementText)) {
                    return {
                        element: element,
                        text: elementText.trim(),
                        confidence: 'medium'
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.log('Error finding answer element:', error);
            return null;
        }
    }

    extractWindowData() {
        try {
            console.log('🔍 Scanning window objects for question data...');
            
            // Common variable names that might contain question data
            const possibleKeys = [
                'questionData', 'slideData', 'currentQuestion', 'questionConfig',
                'answers', 'orderedAnswers', 'questionAnswers', 'quizData',
                '__NEXT_DATA__', 'pageProps', 'initialProps', 'serverData'
            ];
            
            for (const key of possibleKeys) {
                try {
                    if (window[key]) {
                        const data = window[key];
                        const correctAnswer = this.searchObjectForCorrectAnswer(data);
                        if (correctAnswer) {
                            console.log('🎯 Found correct answer in window.' + key + ':', correctAnswer);
                            return this.findAnswerElementByContent(correctAnswer);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Check all window properties for data structures
            for (const key in window) {
                try {
                    if (key.startsWith('__') || key.includes('question') || key.includes('quiz') || key.includes('answer')) {
                        const data = window[key];
                        if (data && typeof data === 'object') {
                            const correctAnswer = this.searchObjectForCorrectAnswer(data);
                            if (correctAnswer) {
                                console.log('🎯 Found correct answer in window.' + key + ':', correctAnswer);
                                return this.findAnswerElementByContent(correctAnswer);
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.log('Error extracting window data:', error);
            return null;
        }
    }

    searchObjectForCorrectAnswer(obj) {
        try {
            const maxDepth = 5;
            
            const search = (obj, depth) => {
                if (!obj || depth > maxDepth || typeof obj !== 'object') return null;
                
                // Direct check for isCorrectAnswer
                if (obj.isCorrectAnswer === true && (obj.content || obj.text)) {
                    return obj.content || obj.text;
                }
                
                // Check arrays for correct answers
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        if (item && item.isCorrectAnswer === true && (item.content || item.text)) {
                            return item.content || item.text;
                        }
                        const found = search(item, depth + 1);
                        if (found) return found;
                    }
                }
                
                // Check object properties
                for (const key in obj) {
                    try {
                        if (key.includes('answer') || key.includes('correct') || key.includes('question')) {
                            const found = search(obj[key], depth + 1);
                            if (found) return found;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                return null;
            };
            
            return search(obj, 0);
        } catch (error) {
            console.log('Error searching object:', error);
            return null;
        }
    }

    extractCachedData() {
        try {
            // Check localStorage for cached question data
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('question') || key.includes('quiz') || key.includes('answer') || key.includes('slide'))) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        const correctAnswer = this.searchObjectForCorrectAnswer(data);
                        if (correctAnswer) {
                            console.log('🎯 Found correct answer in localStorage:', correctAnswer);
                            return this.findAnswerElementByContent(correctAnswer);
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            // Check sessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && (key.includes('question') || key.includes('quiz') || key.includes('answer') || key.includes('slide'))) {
                    try {
                        const data = JSON.parse(sessionStorage.getItem(key));
                        const correctAnswer = this.searchObjectForCorrectAnswer(data);
                        if (correctAnswer) {
                            console.log('🎯 Found correct answer in sessionStorage:', correctAnswer);
                            return this.findAnswerElementByContent(correctAnswer);
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.log('Error extracting cached data:', error);
            return null;
        }
    }

    extractEmbeddedJsonData() {
        try {
            // Look for script tags with JSON data
            const scriptTags = document.querySelectorAll('script[type="application/json"], script:not([src])');
            
            for (const script of scriptTags) {
                try {
                    const textContent = script.textContent || script.innerHTML;
                    if (textContent && textContent.includes('isCorrectAnswer')) {
                        const data = JSON.parse(textContent);
                        const correctAnswer = this.searchObjectForCorrectAnswer(data);
                        if (correctAnswer) {
                            console.log('🎯 Found correct answer in embedded JSON:', correctAnswer);
                            return this.findAnswerElementByContent(correctAnswer);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.log('Error extracting embedded JSON data:', error);
            return null;
        }
    }

    extractQuestionText() {
        // Look for question text in various common locations
        const questionSelectors = [
            'h1', 'h2', 'h3', '.question', '[role="heading"]',
            '.question-text', '.quiz-question', '.problem-statement',
            'p:has(span)', 'div:has(p)', '.content p', '.main-content p'
        ];
        
        for (const selector of questionSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent || '';
                    // Look for question-like content (contains ?, is reasonably long, doesn't contain "Incorrect")
                    if (text.includes('?') && text.length > 10 && 
                        !text.includes('Incorrect!') && !text.includes('Try Again')) {
                        return text.trim();
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // Fallback: look for any text containing question marks
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
            const text = element.textContent || '';
            if (text.includes('?') && text.length > 20 && text.length < 500 &&
                !text.includes('Incorrect!') && !text.includes('Try Again') &&
                !text.includes('Continue')) {
                return text.trim();
            }
        }
        
        return '';
    }

    extractAnswerOptions() {
        const answerOptions = [];
        
        // Look for answer elements similar to clickAnswerOptions but for analysis
        const allElements = document.querySelectorAll('button, div[role="button"], label, input[type="radio"], input[type="checkbox"], div[onclick], div[tabindex]');
        
        for (const element of allElements) {
            let text = element.textContent || element.innerText || element.value || '';
            
            // Enhanced text extraction
            if (!text || text.length < 3) {
                const children = element.querySelectorAll('*');
                for (const child of children) {
                    const childText = child.textContent || child.innerText || '';
                    if (childText && childText.length > text.length) {
                        text = childText;
                    }
                }
            }
            
            const trimmedText = text.trim();
            
            // Check for answer pattern (A., B., C., D., etc.)
            if (/^[A-Z]\.\s/.test(trimmedText) && trimmedText.length > 3) {
                answerOptions.push({
                    element: element,
                    text: trimmedText,
                    letter: trimmedText.charAt(0)
                });
            }
        }
        
        // Sort by letter (A, B, C, D)
        answerOptions.sort((a, b) => a.letter.localeCompare(b.letter));
        
        return answerOptions;
    }

    findAnswerFromHints(questionText, answerOptions) {
        try {
            // Look for explanatory text, hints, or context on the page
            const contentElements = document.querySelectorAll('p, div, span, li');
            const pageContent = Array.from(contentElements)
                .map(el => el.textContent || '')
                .join(' ')
                .toLowerCase();
            
            console.log('Analyzing page content for hints...');
            
            // Score each answer based on how well it matches hints in the content
            let bestAnswer = null;
            let bestScore = 0;
            
            for (const answer of answerOptions) {
                const answerText = answer.text.substring(3).toLowerCase(); // Remove "A. " prefix
                const words = answerText.split(/\s+/).filter(word => word.length > 3);
                
                let score = 0;
                for (const word of words) {
                    // Count occurrences of answer words in page content
                    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    const matches = pageContent.match(regex);
                    if (matches) {
                        score += matches.length;
                    }
                }
                
                console.log(`Answer ${answer.letter}: "${answerText.substring(0, 30)}..." - Score: ${score}`);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestAnswer = answer;
                }
            }
            
            // Only return answer if it has a significantly higher score
            if (bestScore > 2 && bestAnswer) {
                console.log('Hint-based analysis suggests:', bestAnswer.letter, 'with score', bestScore);
                return bestAnswer;
            }
            
        } catch (error) {
            console.log('Error in hint analysis:', error);
        }
        
        return null;
    }

    findAnswerFromAttributes(answerOptions) {
        try {
            // Look for HTML attributes that might reveal the correct answer
            for (const answer of answerOptions) {
                const element = answer.element;
                
                // Check for data attributes that might indicate correctness
                const attributes = element.getAttributeNames();
                for (const attr of attributes) {
                    const value = element.getAttribute(attr);
                    if (value && (
                        attr.includes('correct') ||
                        attr.includes('right') ||
                        value.toString().toLowerCase().includes('correct') ||
                        value.toString().toLowerCase().includes('true') ||
                        (attr.includes('data') && value === 'true')
                    )) {
                        console.log('Found potentially correct answer via attributes:', attr, '=', value);
                        return answer;
                    }
                }
                
                // Check for classes that might indicate correctness
                const classes = element.className || '';
                if (classes.includes('correct') || classes.includes('right') || 
                    classes.includes('success') || classes.includes('valid')) {
                    console.log('Found potentially correct answer via classes:', classes);
                    return answer;
                }
            }
            
        } catch (error) {
            console.log('Error in attribute analysis:', error);
        }
        
        return null;
    }

    findAnswerFromVisualCues(questionText, answerOptions) {
        try {
            // Look for visual indicators like bold text, highlights, etc.
            for (const answer of answerOptions) {
                const element = answer.element;
                const style = window.getComputedStyle(element);
                
                // Check for highlighting, bold text, or special styling
                if (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700 ||
                    style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                    style.border.includes('solid') ||
                    style.textDecoration.includes('underline')) {
                    
                    console.log('Found potentially correct answer via visual cues:', answer.letter);
                    console.log('Visual properties:', {
                        fontWeight: style.fontWeight,
                        backgroundColor: style.backgroundColor,
                        border: style.border,
                        textDecoration: style.textDecoration
                    });
                    
                    return answer;
                }
                
                // Check for child elements with special styling
                const styledChildren = element.querySelectorAll('strong, b, em, i, mark, .highlight, .bold');
                if (styledChildren.length > 0) {
                    console.log('Found answer with styled children:', answer.letter);
                    return answer;
                }
            }
            
        } catch (error) {
            console.log('Error in visual cue analysis:', error);
        }
        
        return null;
    }

    findAnswerFromKeywordMatching(questionText, answerOptions) {
        try {
            if (!questionText || questionText.length < 10) {
                return null;
            }
            
            // Extract key terms from the question
            const questionLower = questionText.toLowerCase();
            const questionWords = questionLower
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3)
                .filter(word => !['what', 'which', 'when', 'where', 'that', 'this', 'they', 'them', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should'].includes(word));
            
            console.log('Question keywords:', questionWords.slice(0, 5).join(', '));
            
            // Score answers based on keyword overlap
            let bestAnswer = null;
            let bestScore = 0;
            
            for (const answer of answerOptions) {
                const answerText = answer.text.substring(3).toLowerCase(); // Remove "A. " prefix
                const answerWords = answerText
                    .replace(/[^\w\s]/g, ' ')
                    .split(/\s+/)
                    .filter(word => word.length > 3);
                
                let score = 0;
                for (const qWord of questionWords) {
                    for (const aWord of answerWords) {
                        // Exact match
                        if (qWord === aWord) {
                            score += 3;
                        }
                        // Partial match (one contains the other)
                        else if (qWord.includes(aWord) || aWord.includes(qWord)) {
                            score += 1;
                        }
                    }
                }
                
                console.log(`Keyword analysis - Answer ${answer.letter}: Score ${score}`);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestAnswer = answer;
                }
            }
            
            // Only return if we have a meaningful score difference
            if (bestScore >= 3 && bestAnswer) {
                console.log('Keyword matching suggests:', bestAnswer.letter, 'with score', bestScore);
                return bestAnswer;
            }
            
        } catch (error) {
            console.log('Error in keyword matching:', error);
        }
        
        return null;
    }

    triggerClick(element) {
        // Method 1: Standard click
        element.click();
        
        // Method 2: Dispatch click event with proper bubbling
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(clickEvent);
        
        // Method 3: If it's a radio/checkbox, trigger change event
        if (element.type === 'radio' || element.type === 'checkbox') {
            element.checked = true;
            const changeEvent = new Event('change', { bubbles: true });
            element.dispatchEvent(changeEvent);
        }
        
        // Method 4: Focus and trigger input event for form elements
        if (element.tagName === 'INPUT') {
            element.focus();
            const inputEvent = new Event('input', { bubbles: true });
            element.dispatchEvent(inputEvent);
        }
    }

    findElementsContainingText(tagName, text) {
        const elements = document.querySelectorAll(tagName);
        return Array.from(elements).filter(el => 
            el.textContent && el.textContent.toLowerCase().includes(text.toLowerCase())
        );
    }

    async scrollDown() {
        const beforeScroll = window.scrollY;
        const scrollAmount = Math.min(window.innerHeight * 0.8, 400);
        
        try {
            // Find the actual scrollable container first
            const scrollableContainer = this.findScrollableContainer();
            
            if (scrollableContainer && scrollableContainer !== window) {
                console.log('Found custom scrollable container:', scrollableContainer.tagName, scrollableContainer.className);
                const beforeContainerScroll = scrollableContainer.scrollTop;
                scrollableContainer.scrollTop += scrollAmount;
                
                await this.delay(200);
                
                const afterContainerScroll = scrollableContainer.scrollTop;
                const containerScrollSuccess = afterContainerScroll > beforeContainerScroll;
                
                console.log(`Container scroll attempt: ${beforeContainerScroll}px → ${afterContainerScroll}px (${containerScrollSuccess ? 'SUCCESS' : 'FAILED'})`);
                
                if (containerScrollSuccess) {
                    return true;
                }
            }
            
            // Fallback to standard methods
            window.scrollBy(0, scrollAmount);
            
            if (document.documentElement) {
                document.documentElement.scrollTop += scrollAmount;
            }
            
            if (document.body) {
                document.body.scrollTop += scrollAmount;
            }
            
            // Try all elements with scroll capability
            const allElements = document.querySelectorAll('*');
            let scrolledSomething = false;
            
            for (const element of allElements) {
                if (element.scrollHeight > element.clientHeight + 10) {
                    const beforeElementScroll = element.scrollTop;
                    element.scrollTop += scrollAmount;
                    
                    if (element.scrollTop > beforeElementScroll) {
                        console.log('Successfully scrolled element:', element.tagName, element.className || element.id);
                        scrolledSomething = true;
                        break;
                    }
                }
            }
            
            await this.delay(200);
            
            const afterScroll = window.scrollY;
            const windowScrollSuccess = afterScroll > beforeScroll;
            const anyScrollSuccess = windowScrollSuccess || scrolledSomething;
            
            console.log(`Window scroll attempt: ${beforeScroll}px → ${afterScroll}px (${windowScrollSuccess ? 'SUCCESS' : 'FAILED'})`);
            console.log(`Overall scroll result: ${anyScrollSuccess ? 'SUCCESS' : 'FAILED'}`);
            
            // Check if we're at the bottom regardless of scroll success
            const isAtBottom = this.isAtPageBottom();
            if (isAtBottom) {
                console.log('Reached end of scrollable content - will skip future scroll attempts');
                this.pageFullyScrolled = true;
            } else if (anyScrollSuccess) {
                // Only reset failure count if we actually scrolled successfully
                this.scrollFailureCount = 0;
            }
            
            return anyScrollSuccess;
            
        } catch (error) {
            console.error('Scroll error:', error);
            return false;
        }
    }

    findScrollableContainer() {
        // Look for elements that are likely to be the main scroll container
        const candidates = [
            // Check for common scroll container patterns
            document.querySelector('[data-testid*="scroll"]'),
            document.querySelector('[class*="scroll"]'),
            document.querySelector('[class*="overflow"]'),
            document.querySelector('main'),
            document.querySelector('[role="main"]'),
            document.querySelector('.content'),
            document.querySelector('#content'),
            document.querySelector('[class*="container"]'),
            document.querySelector('[class*="wrapper"]'),
            document.querySelector('[class*="layout"]'),
            // Check body and documentElement
            document.body,
            document.documentElement
        ];
        
        for (const candidate of candidates) {
            if (candidate && candidate.scrollHeight > candidate.clientHeight + 10) {
                const computedStyle = window.getComputedStyle(candidate);
                if (computedStyle.overflowY === 'scroll' || 
                    computedStyle.overflowY === 'auto' || 
                    computedStyle.overflow === 'scroll' || 
                    computedStyle.overflow === 'auto') {
                    console.log('Found scrollable container:', candidate.tagName, candidate.className);
                    return candidate;
                }
            }
        }
        
        // If no specific container found, return window
        return window;
    }

    isAtPageBottom() {
        // Check multiple ways to determine if we're at the bottom
        try {
            // Method 1: Check window scroll position
            const windowAtBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
            
            // Method 2: Check document element
            const docElement = document.documentElement;
            const docAtBottom = docElement.scrollTop + docElement.clientHeight >= docElement.scrollHeight - 100;
            
            // Method 3: Check specific scrollable containers (more targeted approach)
            const scrollableContainer = this.findScrollableContainer();
            let containerAtBottom = false;
            
            if (scrollableContainer && scrollableContainer !== window) {
                containerAtBottom = scrollableContainer.scrollTop >= scrollableContainer.scrollHeight - scrollableContainer.clientHeight - 100;
                console.log(`Container scroll check: ${scrollableContainer.scrollTop} >= ${scrollableContainer.scrollHeight - scrollableContainer.clientHeight - 100} = ${containerAtBottom}`);
            }
            
            // If we have a custom scrollable container, prioritize that check
            const result = scrollableContainer !== window ? containerAtBottom : (windowAtBottom || docAtBottom);
            
            console.log(`Bottom check - Window: ${windowAtBottom}, Doc: ${docAtBottom}, Container: ${containerAtBottom}, Result: ${result}`);
            return result;
            
        } catch (error) {
            console.log('Error checking page bottom:', error);
            // If we can't check, assume we might be at bottom after repeated failures
            return this.scrollFailureCount >= 5;
        }
    }

    async alternativeScroll() {
        console.log('Trying alternative scroll methods...');
        
        try {
            // Method 1: Force scroll on every possible element
            const allElements = Array.from(document.querySelectorAll('*'));
            let foundScrollable = false;
            
            for (const element of allElements) {
                try {
                    if (element.scrollHeight > element.clientHeight) {
                        const before = element.scrollTop;
                        element.scrollTop += 200;
                        element.scrollBy(0, 200);
                        
                        // Also try setting scroll position directly
                        element.scroll(0, before + 200);
                        element.scrollTo(0, before + 200);
                        
                        if (element.scrollTop > before) {
                            console.log('Alternative scroll SUCCESS on:', element.tagName, element.className || element.id);
                            foundScrollable = true;
                            break;
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }
            
            // Method 2: Skip keyboard simulation (causes extension conflicts)
            // Direct element scrolling above is working well, so we'll skip this method
            
            // Method 3: Try wheel events on specific elements (with error handling)
            const targetElements = document.querySelectorAll('body, main, [role="main"], .content, #content');
            for (const element of targetElements) {
                try {
                    const wheelEvent = new WheelEvent('wheel', {
                        deltaY: 400,
                        bubbles: true,
                        cancelable: true,
                        composed: true
                    });
                    element.dispatchEvent(wheelEvent);
                } catch (wheelError) {
                    console.log('Skipped wheel event due to error');
                }
                await this.delay(100);
            }
            
            // Method 4: Try clicking on empty areas to trigger scroll (with error handling)
            try {
                const rect = document.body.getBoundingClientRect();
                const clickEvent = new MouseEvent('click', {
                    clientX: rect.width / 2,
                    clientY: rect.height - 100,
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                document.body.dispatchEvent(clickEvent);
            } catch (clickError) {
                console.log('Skipped click simulation due to error');
            }
            
            console.log('Alternative scroll methods completed');
            
            // Check if we're at bottom after alternative methods
            const isAtBottom = this.isAtPageBottom();
            if (isAtBottom) {
                console.log('Alternative scroll reached bottom - marking page as fully scrolled');
                this.pageFullyScrolled = true;
            }
            
        } catch (error) {
            console.error('Alternative scroll error:', error);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    addVideoSpeedControls() {
        if (!this.videoSpeedEnabled) return;
        
        // Find all video elements
        const videos = document.querySelectorAll('video');
        
        videos.forEach((video, index) => {
            // Skip if already has our custom control
            if (video.dataset.hasCustomSpeed) return;
            
            video.dataset.hasCustomSpeed = 'true';
            
            // Create speed control container
            const speedContainer = document.createElement('div');
            speedContainer.className = 'goethena-speed-control';
            speedContainer.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 10000;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 6px;
                padding: 8px;
                display: flex;
                gap: 4px;
                font-family: Arial, sans-serif;
                font-size: 12px;
            `;
            
            // Create speed buttons
            const speeds = [0.5, 1, 1.5, 2, 5, 10];
            
            speeds.forEach(speed => {
                const btn = document.createElement('button');
                btn.textContent = speed === 1 ? 'Normal' : `${speed}x`;
                btn.dataset.speed = speed; // Store speed for reference
                
                // Check if this speed matches the current video speed
                const isCurrentSpeed = Math.abs(video.playbackRate - speed) < 0.1;
                
                btn.style.cssText = `
                    background: ${isCurrentSpeed ? '#007cba' : '#555'};
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                    min-width: 35px;
                `;
                
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    video.playbackRate = speed;
                    
                    // Update button styles
                    speedContainer.querySelectorAll('button').forEach(b => {
                        b.style.background = '#555';
                    });
                    btn.style.background = '#007cba';
                    
                    console.log(`Video speed set to ${speed}x`);
                });
                
                btn.addEventListener('mouseenter', () => {
                    if (btn.style.background === 'rgb(85, 85, 85)') {
                        btn.style.background = '#666';
                    }
                });
                
                btn.addEventListener('mouseleave', () => {
                    if (btn.style.background === 'rgb(102, 102, 102)') {
                        btn.style.background = '#555';
                    }
                });
                
                speedContainer.appendChild(btn);
            });
            
            // Position the container relative to video
            const videoContainer = video.parentElement;
            if (videoContainer) {
                // Make sure parent has relative positioning
                const computedStyle = window.getComputedStyle(videoContainer);
                if (computedStyle.position === 'static') {
                    videoContainer.style.position = 'relative';
                }
                
                videoContainer.appendChild(speedContainer);
                
                // Listen for speed changes to keep buttons in sync
                video.addEventListener('ratechange', () => {
                    this.syncSpeedButtons(speedContainer, video.playbackRate);
                });
                
                console.log(`Added speed controls to video ${index + 1} (current speed: ${video.playbackRate}x)`);
            }
        });
        
        // Watch for new videos being added dynamically
        this.watchForNewVideos();
    }

    syncSpeedButtons(speedContainer, currentSpeed) {
        const buttons = speedContainer.querySelectorAll('button');
        buttons.forEach(btn => {
            const buttonSpeed = parseFloat(btn.dataset.speed);
            const isCurrentSpeed = Math.abs(currentSpeed - buttonSpeed) < 0.1;
            btn.style.background = isCurrentSpeed ? '#007cba' : '#555';
        });
        console.log(`Synced speed buttons for current speed: ${currentSpeed}x`);
    }

    removeVideoSpeedControls() {
        const controls = document.querySelectorAll('.goethena-speed-control');
        controls.forEach(control => control.remove());
        
        const videos = document.querySelectorAll('video[data-has-custom-speed]');
        videos.forEach(video => {
            delete video.dataset.hasCustomSpeed;
            video.playbackRate = 1; // Reset to normal speed
        });
        
        console.log('Removed video speed controls');
    }

    watchForNewVideos() {
        // Use MutationObserver to watch for new video elements
        if (this.videoObserver) {
            this.videoObserver.disconnect();
        }
        
        this.videoObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        // Check if the added node is a video or contains videos
                        const videos = node.tagName === 'VIDEO' ? [node] : node.querySelectorAll?.('video') || [];
                        
                        if (videos.length > 0 && this.videoSpeedEnabled) {
                            setTimeout(() => this.addVideoSpeedControls(), 500);
                        }
                    }
                });
            });
        });
        
        this.videoObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// Initialize the auto clicker
const autoClicker = new GoEthenaAutoClicker();

// Add visual indicator that shows/hides based on status
let indicator = null;

function showIndicator() {
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'goethena-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #4CAF50;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 10000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        indicator.textContent = 'GoEthena Auto Clicker Active';
        document.body.appendChild(indicator);
    }
}

function hideIndicator() {
    if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
        indicator = null;
    }
}

// Update the start/stop methods to control indicator
const originalStart = autoClicker.start.bind(autoClicker);
const originalStop = autoClicker.stop.bind(autoClicker);

autoClicker.start = function() {
    originalStart();
    showIndicator();
};

autoClicker.stop = function() {
    originalStop();
    hideIndicator();
};

// Remove indicator when page unloads
window.addEventListener('beforeunload', () => {
    hideIndicator();
});