chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.url.startsWith('chrome://')) {
        injectContentScript(tab.id);
      }
    });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    injectContentScript(tabId);
  }
});

function injectContentScript(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['lib/jspdf.umd.min.js']
  });
  
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  });
  
  chrome.scripting.insertCSS({
    target: { tabId: tabId },
    files: ['content.css']
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarizeRequest(request.text, sender.tab.id);
  } else if (request.action === 'test') {
    sendResponse({ status: 'ok', message: 'Background script is working!' });
  }
});

async function handleSummarizeRequest(text, tabId) {
  try {
    const result = await chrome.storage.sync.get(['apiKey']);
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      chrome.tabs.sendMessage(tabId, {
        action: 'displaySummary',
        summary: 'Error: API Key not found. Please set it in the extension popup.'
      });
      return;
    }

    const summary = await getSummaryFromAPI(text, apiKey);
    
    chrome.tabs.sendMessage(tabId, {
      action: 'displaySummary',
      summary: summary
    });
    
  } catch (error) {
    chrome.tabs.sendMessage(tabId, {
      action: 'displaySummary',
      summary: `Error: ${error.message}`
    });
  }
}

async function getSummaryFromAPI(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ 
        parts: [{ 
          text: `Please provide a concise summary of this text:\n\n${text}. Break up your summary into digestible bullet points. Do not bold or italicize the text.` 
        }] 
      }]
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || response.statusText);
  }
  
  return data.candidates[0]?.content?.parts[0]?.text || 'Could not generate summary.';
}