import os

def build_html():
    with open('specclaw_ui_bundle.js', 'r', encoding='utf-8') as f:
        bundle_code = f.read()

    html_content = """<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpecClaw — Autonomous Technical Bid Evaluation (TBE) & Spec-Deviation Clawback Engine</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%2306b6d4'/><text y='70' font-size='56' font-family='sans-serif' font-weight='900' fill='%23020617' x='15'>SC</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
          },
          colors: {
            brand: {
              400: '#38bdf8',
              500: '#0ea5e9',
              600: '#0284c7',
            }
          }
        }
      }
    };
  </script>
  <style>
    body {
      background-color: #0A0B0E;
      color: #F1F3F9;
      font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
      -webkit-font-smoothing: antialiased;
    }
    .transition-silk {
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .transition-snap {
      transition: all 0.15s cubic-bezier(0.2, 0, 0, 1);
    }
    button:active {
      transform: scale(0.98);
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #0A0B0E;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #1E202B;
      border-radius: 9999px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #2E3142;
    }
    @media (prefers-reduced-motion: reduce) {
      *, ::before, ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body class="bg-[#0A0B0E] text-gray-100 min-h-screen selection:bg-cyan-500/20 selection:text-cyan-300">
  <div id="root">
    <div class="min-h-screen flex items-center justify-center bg-[#0A0B0E] text-gray-400 font-mono text-xs">
      <div class="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[#1E202B] bg-[#12131A]">
        <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        <span>Loading SpecClaw Industrial Suite...</span>
      </div>
    </div>
  </div>

  <script>
""" + bundle_code + """
  </script>
</body>
</html>"""

    with open('specclaw_interactive_mvp.html', 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"Successfully generated specclaw_interactive_mvp.html ({len(html_content):,} bytes)")

if __name__ == '__main__':
    build_html()

