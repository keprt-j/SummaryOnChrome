document.addEventListener('DOMContentLoaded', () => {
    const getEl = (id) => document.getElementById(id);
    const queryEl = (selector) => document.querySelector(selector);

    const elements = {
        apiKeySection: getEl('api-key-section'),
        mainContent: getEl('main-content'),
        apiKeyInput: getEl('apiKey'),
        saveApiKeyBtn: getEl('saveApiKeyBtn'),
        changeApiKeyBtn: getEl('changeApiKeyBtn'),
        themeSwitch: queryEl('#checkbox'),
        activeTabRadio: getEl('activeTabRadio'),
        youtubeRadio: getEl('youtubeRadio'),
        youtubeInputContainer: getEl('youtubeInputContainer'),
        youtubeUrl: getEl('youtubeUrl'),
        summarizeBtn: getEl('summarizeBtn'),
        summaryP: getEl('summary'),
        saveButtons: getEl('save-buttons'),
        savePdfBtn: getEl('savePdfBtn'),
    };

    const showView = (viewName) => {
        elements.mainContent.style.display = viewName === 'main' ? 'block' : 'none';
        elements.apiKeySection.style.display = viewName === 'api' ? 'block' : 'none';
    };

    async function getSummary(documentContent, apiKey) {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Please provide a summary of this:\n\n${documentContent}. Break up your summary into digestible bullet points. Do not bold or italicize the text.` }] }]
            })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || response.statusText);
        }
        return data.candidates[0]?.content?.parts[0]?.text;
    }

    function getYoutubeVideoId(url) {
        const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
        return match && match[2].length === 11 ? match[2] : null;
    }

    async function fetchYouTubeTranscript(videoId) {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch video page: ${response.status}`);
        }
        
        const html = await response.text();
        const textMatches = html.match(/"text":\s*"([^"]+)"/g);
        
        if (!textMatches || textMatches.length < 5) {
            throw new Error('No transcript data found in video page.');
        }
        
        return textMatches
            .map(match => match.match(/"text":\s*"([^"]+)"/)[1])
            .join(' ');
    }

    async function getTranscriptFromYouTube(url) {
        const videoId = getYoutubeVideoId(url);
        if (!videoId) {
            elements.summaryP.innerText = 'Error: Invalid YouTube URL.';
            return null;
        }
        
        try {
            const transcript = await fetchYouTubeTranscript(videoId);
            return transcript.trim().length > 0 ? transcript : null;
        } catch (error) {
            elements.summaryP.innerText = 'Error: Could not get transcript.';
            return null;
        }
    }

    async function getContentFromActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            elements.summaryP.innerText = 'No active tab found.';
            return null;
        }
        
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.body.innerText,
            });
            return results[0].result;
        } catch (error) {
            elements.summaryP.innerText = 'Error: Could not access active tab content.';
            return null;
        }
    }

    const handleSaveApiKey = () => {
        const apiKey = elements.apiKeyInput.value;
        if (apiKey) {
            chrome.storage.sync.set({ apiKey }, () => showView('main'));
        }
    };

    const handleChangeApiKey = (e) => {
        e.preventDefault();
        showView('api');
    };

    const handleThemeSwitch = (e) => {
        const newTheme = e.target.checked ? 'dark-mode' : 'light-mode';
        document.body.classList.remove(localStorage.getItem('theme'));
        document.body.classList.add(newTheme);
        localStorage.setItem('theme', newTheme);
    };

    const handleInputTypeChange = () => {
        elements.youtubeInputContainer.style.display = elements.youtubeRadio.checked ? 'block' : 'none';
    };

    const handleSummarize = async () => {
        const inputType = queryEl('input[name="inputType"]:checked').value;
        let content = '';

        elements.summaryP.innerText = 'Summarizing...';
        elements.summaryP.style.display = 'block';
        elements.saveButtons.style.display = 'none';

        if (inputType === 'activeTab') {
            content = await getContentFromActiveTab();
        } else if (inputType === 'youtube') {
            const url = elements.youtubeUrl.value;
            if (url) {
                chrome.storage.local.set({ lastYoutubeUrl: url });
                content = await getTranscriptFromYouTube(url);
            }
        }

        if (!content) return;

        chrome.storage.sync.get(['apiKey'], async ({ apiKey }) => {
            if (apiKey) {
                try {
                    const summary = await getSummary(content, apiKey);
                    elements.summaryP.innerText = summary || 'Could not generate a summary.';
                    if (summary) {
                        elements.saveButtons.style.display = 'block';
                        chrome.storage.local.set({ lastSummary: summary });
                    }
                } catch (error) {
                    elements.summaryP.innerText = `Error: ${error.message}`;
                }
            } else {
                elements.summaryP.innerText = 'API Key not found. Please set it first.';
            }
        });
    };

    const handleSavePdf = () => {
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const summaryText = elements.summaryP.textContent;
            const lines = doc.splitTextToSize(summaryText, 180);
            doc.text(lines, 10, 10);
            doc.save('summary.pdf');
        } else {
            alert('Error: Could not save as PDF.');
        }
    };

    const init = () => {
        elements.saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
        elements.changeApiKeyBtn.addEventListener('click', handleChangeApiKey);
        elements.themeSwitch.addEventListener('change', handleThemeSwitch);
        elements.activeTabRadio.addEventListener('change', handleInputTypeChange);
        elements.youtubeRadio.addEventListener('change', handleInputTypeChange);
        elements.summarizeBtn.addEventListener('click', handleSummarize);
        elements.savePdfBtn.addEventListener('click', handleSavePdf);

        chrome.storage.sync.get(['apiKey'], (result) => {
            showView(result.apiKey ? 'main' : 'api');
        });

        chrome.storage.local.get(['lastYoutubeUrl', 'lastSummary'], (result) => {
            if (result.lastYoutubeUrl) {
                elements.youtubeUrl.value = result.lastYoutubeUrl;
            }
            if (result.lastSummary) {
                elements.summaryP.innerText = result.lastSummary;
                elements.summaryP.style.display = 'block';
                elements.saveButtons.style.display = 'block';
            }
        });

        const currentTheme = localStorage.getItem('theme') || 'light-mode';
        document.body.classList.add(currentTheme);
        elements.themeSwitch.checked = currentTheme === 'dark-mode';
    };

    init();
});
