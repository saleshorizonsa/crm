# React

A modern React-based project utilizing the latest frontend technologies and tools for building responsive web applications.

## 🚀 Features

- **React 18** - React version with improved rendering and concurrent features
- **Vite** - Lightning-fast build tool and development server
- **Redux Toolkit** - State management with simplified Redux setup
- **TailwindCSS** - Utility-first CSS framework with extensive customization
- **React Router v6** - Declarative routing for React applications
- **Data Visualization** - Integrated D3.js and Recharts for powerful data visualization
- **Form Management** - React Hook Form for efficient form handling
- **Animation** - Framer Motion for smooth UI animations
- **Testing** - Jest and React Testing Library setup

## 📋 Prerequisites

- Node.js (v14.x or higher)
- npm or yarn

## 🛠️ Installation

1. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```
   
2. Enable the repo git hooks (once per clone):
   ```bash
   git config core.hooksPath .githooks
   ```
   Runs `npm run lint:tables` on staged files before each commit. It blocks
   `overflow-hidden` on an element wrapping a `<table>`, which clips the
   right-hand columns on narrow screens with no scrollbar to show that anything
   is missing. A responsive audit found 15 of these.

3. Start the development server:
   ```bash
   npm start
   # or
   yarn start
   ```

## 📁 Project Structure

```
react_app/
├── public/             # Static assets
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page components
│   ├── styles/         # Global styles and Tailwind configuration
│   ├── App.jsx         # Main application component
│   ├── Routes.jsx      # Application routes
│   └── index.jsx       # Application entry point
├── .env                # Environment variables
├── index.html          # HTML template
├── package.json        # Project dependencies and scripts
├── tailwind.config.js  # Tailwind CSS configuration
└── vite.config.js      # Vite configuration
```

## 🧩 Adding Routes

To add new routes to the application, update the `Routes.jsx` file:

```jsx
import { useRoutes } from "react-router-dom";
import HomePage from "pages/HomePage";
import AboutPage from "pages/AboutPage";

const ProjectRoutes = () => {
  let element = useRoutes([
    { path: "/", element: <HomePage /> },
    { path: "/about", element: <AboutPage /> },
    // Add more routes as needed
  ]);

  return element;
};
```

## 🎨 Styling

This project uses Tailwind CSS for styling. The configuration includes:

- Forms plugin for form styling
- Typography plugin for text styling
- Aspect ratio plugin for responsive elements
- Container queries for component-specific responsive design
- Fluid typography for responsive text
- Animation utilities

## 📱 Responsive Design

The app is built with responsive design using Tailwind CSS breakpoints.

Conventions from the responsive audit:

- **Tables scroll, never clip.** `overflow-x-auto` on the wrapper, plus
  `min-w-[Npx]` on the `<table>` when the columns need room (~60-80px per
  column, more for unbreakable strings like an email or item code). The
  pre-commit hook rejects `overflow-hidden` on a table wrapper.
- **Modal panels need a height cap:** `max-h-[90vh] flex flex-col` on the panel,
  `flex-shrink-0` on header/footer, `flex-1 overflow-y-auto min-h-0` on the body.
  Without one the submit button can sit off-screen and unreachable.
- **Grids holding currency** need ~110px per cell at `text-lg`. At a 375px viewport
  the page has ~343px of content, so `grid-cols-3` and above usually needs a
  `grid-cols-1 sm:` or `grid-cols-2 sm:` prefix.
- **Write class names as complete literals.** Tailwind's JIT only scans source
  text, so `lg:${cond ? "grid-cols-5" : "grid-cols-4"}` generates no CSS at all.
  Write `${cond ? "lg:grid-cols-5" : "lg:grid-cols-4"}` instead.


## 📦 Deployment

Build the application for production:

```bash
npm run build
```

## 🙏 Acknowledgments

- Built with [Rocket.new](https://rocket.new)
- Powered by React and Vite
- Styled with Tailwind CSS

Built with ❤️ on Rocket.new
