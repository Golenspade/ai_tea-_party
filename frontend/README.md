# AI Tea Party Frontend

Modern React/Next.js frontend for AI Tea Party chatroom built with shadcn/ui components.

## Features

- 🎨 Modern UI built with [shadcn/ui](https://ui.shadcn.com/)
- ⚡ Next.js 15 with App Router
- 🎯 TypeScript for type safety
- 🎨 Tailwind CSS for styling
- 🌗 Dark mode support
- 📱 Responsive design
- 🔄 Real-time WebSocket communication

## Tech Stack

- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **WebSocket**: Native WebSocket API

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Backend server running on `http://127.0.0.1:3004`

### Installation

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://127.0.0.1:3001](http://127.0.0.1:3001) in your browser

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── app/
│   ├── globals.css          # Global styles and Tailwind config
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main chat page
├── components/
│   └── ui/                  # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── select.tsx
│       └── ...
├── lib/
│   └── utils.ts             # Utility functions
└── components.json          # shadcn/ui configuration
```

## Features

### Character Management
- Add new AI characters with personality, background, and speaking style
- Delete characters
- Trigger AI responses for specific characters
- Visual character cards with avatars

### Chat Interface
- Real-time message display
- Select character to send messages
- Auto-scroll to latest messages
- Message timestamps
- Character avatars with color coding

### Chat Controls
- Start/Stop auto chat mode
- Clear chat history
- Connection status indicator

### API Configuration
- Configure AI provider (DeepSeek, Gemini)
- Set API keys
- Optional model selection

## API Endpoints

The frontend connects to the following backend endpoints:

- `GET /api/characters` - Fetch all characters
- `POST /api/characters` - Add new character
- `DELETE /api/characters/:id` - Delete character
- `POST /api/ai_message` - Generate AI message
- `POST /api/auto_chat/start` - Start auto chat
- `POST /api/auto_chat/stop` - Stop auto chat
- `POST /api/config` - Save API configuration
- `WS /ws` - WebSocket connection for real-time updates

## Customization

### Adding New Components

Use the shadcn CLI to add more components:

```bash
npx shadcn@latest add [component-name]
```

### Styling

The project uses Tailwind CSS. Global styles and theme variables are in `app/globals.css`.

### Theme

To customize the theme, edit the CSS variables in `app/globals.css` or use the shadcn theme editor.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run e2e` - Run Playwright E2E tests
- `npm run e2e:smoke` - Run E2E smoke tests
- `npm run e2e:ui` - Run Playwright UI mode

### E2E Skill

- `docs/E2E_TEST_SKILL.md` contains the runnable E2E workflow for variables.

### Environment Variables

Create a `.env.local` file if needed:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Troubleshooting

### WebSocket Connection Issues

Make sure the backend server is running on port 8000. Check browser console for connection errors.

### CORS Issues

If you encounter CORS errors, ensure the backend has proper CORS configuration for `http://127.0.0.1:3001`.

## License

Same as parent project
