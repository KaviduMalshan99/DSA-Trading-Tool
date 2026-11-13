import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './course.css';
import CourseSite from './CourseSite';

/** Entry for VITE_SITE_MODE=course. Imports nothing from the chart app. */
export function mount(el: HTMLElement) {
  createRoot(el).render(
    <StrictMode>
      <CourseSite />
    </StrictMode>,
  );
}
