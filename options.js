// options.js - Settings page logic

document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const settings = await chrome.storage.sync.get({
    useUrlHierarchy: true,
    useContentAnalysis: false,
    autoGroup: false,
    llmEnabled: false,
    llmApiKey: '',
    llmApiUrl: 'https://api.openai.com/v1/chat/completions',
    llmModel: 'gpt-4o-mini'
  });

  // Populate form
  document.getElementById('useUrlHierarchy').checked = settings.useUrlHierarchy;
  document.getElementById('useContentAnalysis').checked = settings.useContentAnalysis;
  document.getElementById('autoGroup').checked = settings.autoGroup;
  document.getElementById('llmEnabled').checked = settings.llmEnabled;
  document.getElementById('llmApiKey').value = settings.llmApiKey;
  document.getElementById('llmApiUrl').value = settings.llmApiUrl;
  document.getElementById('llmModel').value = settings.llmModel;

  // Save settings
  document.getElementById('save').addEventListener('click', async () => {
    const newSettings = {
      useUrlHierarchy: document.getElementById('useUrlHierarchy').checked,
      useContentAnalysis: document.getElementById('useContentAnalysis').checked,
      autoGroup: document.getElementById('autoGroup').checked,
      llmEnabled: document.getElementById('llmEnabled').checked,
      llmApiKey: document.getElementById('llmApiKey').value,
      llmApiUrl: document.getElementById('llmApiUrl').value || 'https://api.openai.com/v1/chat/completions',
      llmModel: document.getElementById('llmModel').value || 'gpt-4o-mini'
    };

    await chrome.storage.sync.set(newSettings);

    // Show saved message
    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });
});