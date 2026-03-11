# 🪹 TabNest

Intelligent Chrome tab grouping with URL hierarchy & content understanding.

## Features

- **URL Hierarchy Grouping** - Groups tabs by URL path structure
  - `github.com/owner/repo` → Groups all tabs from the same repo
  - `docs.python.org/3/library` → Groups by documentation section
  
- **Smart Domain Detection** - Special handling for:
  - Code hosting sites (GitHub, GitLab, Gitee)
  - Documentation sites
  - And more...

- **Optional AI Integration** - Use LLM for semantic grouping

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `tabnest` folder

## Usage

1. Click the TabNest icon in your toolbar
2. Click "Group All Tabs" to organize all open tabs
3. Or "Group Current Window" for just the current window

## Settings

- **URL Hierarchy** - Enable/disable path-based grouping
- **Auto-group** - Automatically add new tabs to existing groups
- **Content Analysis** - Analyze page content (experimental)
- **AI Integration** - Connect to OpenAI-compatible APIs for smarter grouping

## Development

```bash
# No build required - load unpacked extension

# For production build (optional)
zip -r tabnest.zip manifest.json *.html *.js *.css icons/
```

## License

MIT