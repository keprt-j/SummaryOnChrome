// Simple and reliable content script for text selection and summarization

// Check if already injected to prevent duplicates
if (window.summarizerExtensionLoaded) {
    throw new Error('Already loaded');
}
window.summarizerExtensionLoaded = true;

// Global variables
let currentButton = null;
let isProcessing = false;

// Main text selection handler
let selectionTimeout = null;
let lastSelectedText = '';

document.addEventListener('mouseup', function(event) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // Clear any existing timeout
    if (selectionTimeout) {
        clearTimeout(selectionTimeout);
    }
    
    // Only create button if text is different from last selection
    if (selectedText.length > 0 && selectedText.length < 10000 && selectedText !== lastSelectedText) {
        // Remove existing button first
        if (currentButton) {
            currentButton.remove();
            currentButton = null;
        }
        
        // Add a small delay to prevent rapid button creation
        selectionTimeout = setTimeout(() => {
            // Check if text is still selected and hasn't changed
            const currentSelection = window.getSelection();
            const currentText = currentSelection.toString().trim();
            
            if (currentText.length > 0 && currentText.length < 10000 && currentText === selectedText) {
                lastSelectedText = selectedText;
                createSummarizeButton(event, selectedText);
            }
        }, 200);
    } else if (selectedText.length === 0) {
        // Clear selection - remove button
        if (currentButton) {
            currentButton.remove();
            currentButton = null;
        }
        lastSelectedText = '';
    }
});

// Create the summarize button
function createSummarizeButton(event, text) {
    if (isProcessing) {
        return;
    }
    
    currentButton = document.createElement('button');
    currentButton.textContent = '📝 Summarize';
    currentButton.id = 'summarize-button';
    currentButton.className = 'summarize-button';
    
    const x = event.clientX;
    const y = event.clientY;
    currentButton.style.left = (x - 60) + 'px';
    currentButton.style.top = (y - 45) + 'px';
    
    currentButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        summarizeText(text);
    });
    
    document.body.appendChild(currentButton);
    
    setTimeout(function() {
        if (currentButton && currentButton.parentNode && !isProcessing) {
            currentButton.remove();
            currentButton = null;
            lastSelectedText = '';
        }
    }, 10000);
}

// Handle text summarization
function summarizeText(text) {
    if (isProcessing) {
        return;
    }
    
    isProcessing = true;
    
    // Update button to show processing
    if (currentButton) {
        currentButton.textContent = '⏳ Processing...';
        currentButton.disabled = true;
    }
    
    // Send message to background script
    chrome.runtime.sendMessage({
        action: 'summarize',
        text: text
    }, function(response) {
        isProcessing = false;
        
        // Remove button
        if (currentButton) {
            currentButton.remove();
            currentButton = null;
        }
    });
}

// Listen for summary response
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    
    if (request.action === 'displaySummary') {
        showSummaryModal(request.summary);
    }
});

// Show summary modal
function showSummaryModal(summary) {
    
    // Remove existing modal
    const existingModal = document.getElementById('summary-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'summary-modal';
    
    // Create modal content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    // Add header
    const header = document.createElement('div');
    header.className = 'modal-header';
    
    const title = document.createElement('h2');
    title.textContent = '📋 Summary';
    title.className = 'modal-title';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'modal-close-btn';
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Add summary text
    const summaryText = document.createElement('div');
    summaryText.className = 'modal-body';
    summaryText.innerHTML = summary.replace(/\n/g, '<br>');
    
    // Add buttons
    const buttons = document.createElement('div');
    buttons.className = 'modal-footer';
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy';
    copyBtn.className = 'modal-btn copy-btn';
    
    const savePdfBtn = document.createElement('button');
    savePdfBtn.textContent = '📄 Save PDF';
    savePdfBtn.className = 'modal-btn save-pdf-btn';
    
    const qaBtn = document.createElement('button');
    qaBtn.textContent = '❓ Ask Questions';
    qaBtn.className = 'modal-btn qa-btn';
    
    const closeModalBtn = document.createElement('button');
    closeModalBtn.textContent = 'Close';
    closeModalBtn.className = 'modal-btn close-modal-btn';
    
    buttons.appendChild(copyBtn);
    buttons.appendChild(savePdfBtn);
    buttons.appendChild(qaBtn);
    buttons.appendChild(closeModalBtn);
    
    // Assemble modal
    content.appendChild(header);
    content.appendChild(summaryText);
    content.appendChild(buttons);
    modal.appendChild(content);
    
    // Add to page
    document.body.appendChild(modal);
    
    // Add event listeners
    function closeModal() {
        modal.remove();
        // Also close Q&A modal if it's open
        const qaModal = document.getElementById('qa-modal');
        if (qaModal) {
            qaModal.remove();
        }
    }
    
    closeBtn.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('click', closeModal);
    
    copyBtn.addEventListener('click', function() {
        // Format text for better pasting into Google Docs and other applications
        const formattedText = summary
            .replace(/\n\n/g, '\n') // Remove double line breaks
            .replace(/\n•/g, '\n• ') // Ensure bullet points have space
            .replace(/\n\d+\./g, '\n$& ') // Ensure numbered lists have space
            .trim();
        
        navigator.clipboard.writeText(formattedText).then(function() {
            copyBtn.textContent = '✅ Copied!';
            setTimeout(function() {
                copyBtn.textContent = '📋 Copy';
            }, 2000);
        }).catch(function() {
            copyBtn.textContent = '❌ Failed';
            setTimeout(function() {
                copyBtn.textContent = '📋 Copy';
            }, 2000);
        });
    });
    
    savePdfBtn.addEventListener('click', function() {
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const lines = doc.splitTextToSize(summary, 180);
            doc.text(lines, 10, 10);
            doc.save('summary.pdf');
            savePdfBtn.textContent = '✅ Saved!';
            setTimeout(function() {
                savePdfBtn.textContent = '📄 Save PDF';
            }, 2000);
        } else {
            savePdfBtn.textContent = '❌ Error';
            setTimeout(function() {
                savePdfBtn.textContent = '📄 Save PDF';
            }, 2000);
        }
    });
    
    qaBtn.addEventListener('click', function() {
        showQAModal();
        // Add class to summary modal to adjust its position with animation
        modal.classList.add('with-qa');
        modal.style.animation = 'slideToLeft 0.3s ease-out';
    });
    
    // Close on outside click
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });
    
}

// Right-click context menu
document.addEventListener('contextmenu', function(event) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText.length > 0 && selectedText.length < 10000) {
        
        // Remove existing context menu
        const existingMenu = document.getElementById('context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.id = 'context-menu';
        
        const menuItem = document.createElement('div');
        menuItem.textContent = '📝 Summarize Selection';
        menuItem.className = 'context-menu-item';
        
        menuItem.addEventListener('click', function() {
            summarizeText(selectedText);
            contextMenu.remove();
        });
        
        contextMenu.appendChild(menuItem);
        document.body.appendChild(contextMenu);
        
        // Position context menu
        contextMenu.style.left = event.clientX + 'px';
        contextMenu.style.top = event.clientY + 'px';
        
        // Remove after 3 seconds
        setTimeout(function() {
            if (contextMenu.parentNode) {
                contextMenu.remove();
            }
        }, 3000);
        
        // Remove on click outside
        document.addEventListener('click', function removeMenu() {
            if (contextMenu.parentNode) {
                contextMenu.remove();
            }
            document.removeEventListener('click', removeMenu);
        });
    }
});

// Q&A Modal functionality
function showQAModal() {
    // Remove existing Q&A modal
    const existingQAModal = document.getElementById('qa-modal');
    if (existingQAModal) {
        existingQAModal.remove();
    }
    
    // Create Q&A modal
    const qaModal = document.createElement('div');
    qaModal.id = 'qa-modal';
    
    const qaContent = document.createElement('div');
    qaContent.className = 'modal-content qa-modal-content';
    
    // Add header
    const qaHeader = document.createElement('div');
    qaHeader.className = 'modal-header';
    
    const qaTitle = document.createElement('h2');
    qaTitle.textContent = '❓ Ask Questions';
    qaTitle.className = 'modal-title';
    
    const qaCloseBtn = document.createElement('button');
    qaCloseBtn.textContent = '×';
    qaCloseBtn.className = 'modal-close-btn';
    
    qaHeader.appendChild(qaTitle);
    qaHeader.appendChild(qaCloseBtn);
    
    // Add Q&A body (matching summary modal structure)
    const qaBody = document.createElement('div');
    qaBody.className = 'modal-body';
    
    const questionInput = document.createElement('input');
    questionInput.type = 'text';
    questionInput.placeholder = 'Ask a question about this page...';
    questionInput.className = 'qa-input';
    questionInput.id = 'qa-question-input';
    
    const askBtn = document.createElement('button');
    askBtn.textContent = 'Ask Question';
    askBtn.className = 'modal-btn ask-btn';
    askBtn.id = 'qa-ask-btn';
    
    const qaResult = document.createElement('div');
    qaResult.className = 'qa-result';
    qaResult.id = 'qa-result';
    
    qaBody.appendChild(questionInput);
    qaBody.appendChild(askBtn);
    qaBody.appendChild(qaResult);
    
    // Add Q&A footer (matching summary modal structure)
    const qaFooter = document.createElement('div');
    qaFooter.className = 'modal-footer';
    
    const closeQAModalBtn = document.createElement('button');
    closeQAModalBtn.textContent = 'Close';
    closeQAModalBtn.className = 'modal-btn close-modal-btn';
    
    qaFooter.appendChild(closeQAModalBtn);
    
    // Assemble Q&A modal (matching summary modal structure)
    qaContent.appendChild(qaHeader);
    qaContent.appendChild(qaBody);
    qaContent.appendChild(qaFooter);
    qaModal.appendChild(qaContent);
    
    // Add to page
    document.body.appendChild(qaModal);
    
    // Add event listeners
    function closeQAModal() {
        // Add slide-out animation
        qaModal.style.animation = 'slideOutRight 0.3s ease-in forwards';
        
        setTimeout(() => {
            qaModal.remove();
            // Remove the class from summary modal to restore its position
            const summaryModal = document.getElementById('summary-modal');
            if (summaryModal) {
                summaryModal.classList.remove('with-qa');
            }
        }, 300);
    }
    
    qaCloseBtn.addEventListener('click', closeQAModal);
    closeQAModalBtn.addEventListener('click', closeQAModal);
    
    // Handle question asking
    askBtn.addEventListener('click', function() {
        handleQAQuestion();
    });
    
    questionInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleQAQuestion();
        }
    });
    
    // Close on outside click
    qaModal.addEventListener('click', function(event) {
        if (event.target === qaModal) {
            closeQAModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeQAModal();
        }
    });
    
    // Focus on input
    questionInput.focus();
}

// Handle Q&A question
async function handleQAQuestion() {
    const questionInput = document.getElementById('qa-question-input');
    const askBtn = document.getElementById('qa-ask-btn');
    const qaResult = document.getElementById('qa-result');
    
    const question = questionInput.value.trim();
    if (!question) {
        qaResult.textContent = 'Please enter a question.';
        qaResult.className = 'qa-result error';
        return;
    }
    
    // Show processing state (matching summary modal style)
    askBtn.textContent = '⏳ Processing...';
    askBtn.disabled = true;
    
    try {
        // Get page content
        const pageContent = getPageContent();
        
        // Send to background script for API call
        chrome.runtime.sendMessage({
            action: 'askQuestion',
            question: question,
            content: pageContent
        }, function(response) {
            askBtn.textContent = 'Ask Question';
            askBtn.disabled = false;
            
            if (response && response.success) {
                // Format answer with proper indentation (matching summary format)
                const formattedAnswer = response.answer.replace(/\n/g, '<br>');
                qaResult.innerHTML = formattedAnswer;
                qaResult.className = 'qa-result success';
            } else {
                qaResult.textContent = response?.error || 'Error: Could not generate an answer.';
                qaResult.className = 'qa-result error';
            }
        });
        
    } catch (error) {
        askBtn.textContent = 'Ask Question';
        askBtn.disabled = false;
        qaResult.textContent = `Error: ${error.message}`;
        qaResult.className = 'qa-result error';
    }
}

// Get page content for Q&A
function getPageContent() {
    // Try to get main content first
    const mainContent = document.querySelector('main, article, .content, .post, .entry');
    if (mainContent) {
        return mainContent.innerText || mainContent.textContent;
    }
    
    // Fallback to body content
    const body = document.body;
    return body.innerText || body.textContent;
}
