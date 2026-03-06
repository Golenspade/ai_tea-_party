# Frontend Migration to shadcn/ui

This document describes the migration of the AI Tea Party frontend from vanilla HTML/CSS/JavaScript to a modern Next.js application using shadcn/ui components.

## Overview

The original frontend was built with:
- Vanilla HTML templates (Jinja2)
- Custom CSS with glass morphism effects
- Plain JavaScript for interactivity
- WebGL for background effects

The new frontend is built with:
- **Next.js 15** (App Router)
- **TypeScript** for type safety
- **shadcn/ui** components
- **Tailwind CSS** for styling
- **Lucide React** for icons

## Architecture Changes

### Before (Original)
```
Backend (FastAPI) → Templates (Jinja2) → Static Files
                  ↓
            WebSocket Server
```

### After (New)
```
Backend (FastAPI) ← API Client ← Next.js Frontend
                  ↓
            WebSocket Server
```

## Component Mapping

| Original Feature | shadcn/ui Components |
|-----------------|---------------------|
| Glass panels | `Card` component with backdrop blur |
| Buttons | `Button` component with variants |
| Input fields | `Input`, `Textarea` components |
| Dropdowns | `Select` component |
| Modals | `Dialog` component |
| Avatars | `Avatar` component |
| Badges | `Badge` component |
| Scrollable areas | `ScrollArea` component |

## Key Features Implemented

### ✅ Character Management
- Add characters with Dialog form
- Display character cards with Avatar
- Delete characters
- Trigger AI responses
- Color-coded avatars

### ✅ Chat Interface
- Real-time message display
- Auto-scrolling to latest messages
- Message timestamps
- Character selection with Select dropdown
- Send messages with Enter key

### ✅ Chat Controls
- Start/Stop auto chat toggle
- Clear chat history
- Connection status badge

### ✅ API Configuration
- Configure AI provider
- Set API keys (password input)
- Optional model selection

### ✅ Real-time Updates
- WebSocket connection for live messages
- Connection status indicator
- Automatic character list refresh

## Installation & Setup

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

## Project Structure

```
frontend/
├── app/
│   ├── globals.css          # Tailwind CSS + theme variables
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Main chat page component
├── components/
│   └── ui/                  # shadcn/ui components
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       └── textarea.tsx
├── lib/
│   └── utils.ts             # Utility functions (cn helper)
├── components.json          # shadcn/ui configuration
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
└── README.md                # Frontend documentation
```

## API Integration

The frontend communicates with the backend via:

### REST API Endpoints
- `GET /api/characters` - Fetch all characters
- `POST /api/characters` - Create new character
- `DELETE /api/characters/:id` - Delete character
- `POST /api/ai_message` - Generate AI message
- `POST /api/auto_chat/start` - Start auto chat
- `POST /api/auto_chat/stop` - Stop auto chat
- `POST /api/config` - Save API configuration

### WebSocket
- `WS /ws` - Real-time message broadcasting

## Design System

### Color Scheme
- Uses Tailwind CSS with custom theme variables
- Supports light and dark modes
- Neutral base color (from shadcn/ui)

### Typography
- Geist Sans (variable font)
- Geist Mono (for code/monospace)

### Layout
- Fixed header with backdrop blur
- Sidebar for character management (320px width)
- Flexible chat area
- Responsive design

## Benefits of Migration

1. **Type Safety** - TypeScript catches errors at compile time
2. **Component Reusability** - shadcn/ui components are highly reusable
3. **Better Developer Experience** - Hot reload, better debugging
4. **Modern UI/UX** - Professional, accessible components
5. **Maintainability** - Clear component structure
6. **Performance** - React optimizations, lazy loading
7. **Accessibility** - Built-in ARIA attributes from Radix UI
8. **Scalability** - Easy to add new features and components

## Future Enhancements

Potential improvements:
- [ ] Add toast notifications for actions
- [ ] Implement message reactions
- [ ] Add typing indicators
- [ ] Character customization (colors, avatars)
- [ ] Message search and filtering
- [ ] Export chat history
- [ ] User authentication
- [ ] Multiple chat rooms
- [ ] Voice synthesis for character messages
- [ ] Image generation for characters

## Differences from Original

### Removed Features
- WebGL liquid glass background (can be re-added if needed)
- Some custom animations (replaced with Tailwind animations)

### New Features
- Dark mode support
- Better mobile responsiveness
- Keyboard shortcuts (Enter to send)
- Loading states
- Better error handling
- TypeScript type checking

## Running Both Frontends

You can run both frontends simultaneously:

1. **Original Frontend**: `http://localhost:8000` (served by backend)
2. **New Frontend**: `http://localhost:3000` (Next.js dev server)

Both connect to the same backend API and WebSocket server.

## Migration Checklist

- [x] Initialize Next.js project with TypeScript
- [x] Configure Tailwind CSS
- [x] Set up shadcn/ui
- [x] Install required components
- [x] Create main layout
- [x] Implement character management UI
- [x] Implement chat interface
- [x] Implement modals/dialogs
- [x] Set up WebSocket connection
- [x] Add API configuration
- [x] Update documentation

## Troubleshooting

### WebSocket Connection Failed
- Ensure backend is running on port 8000
- Check browser console for errors
- Verify CORS settings in backend

### Components Not Rendering
- Clear `.next` cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`

### Build Errors
- Check TypeScript errors: `npm run type-check`
- Verify all imports are correct
- Ensure all environment variables are set

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Radix UI Documentation](https://www.radix-ui.com/primitives)
