// Site switch (build-time): VITE_SITE_MODE = "course" | "chart" (default "chart").
// Vite replaces import.meta.env.VITE_SITE_MODE statically, so the unused branch
// (and its whole dynamic chunk) is dropped from the build.
const root = document.getElementById('root')!;

if (import.meta.env.VITE_SITE_MODE === 'course') {
  import('./course/mount').then((m) => m.mount(root));
} else {
  import('./chartMount').then((m) => m.mount(root));
}
