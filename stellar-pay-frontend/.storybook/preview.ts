import type { Preview } from '@storybook/react';
import '../src/theme.css';

const preview: Preview = {
  parameters: {
    // Fail the a11y panel on violations rather than only reporting them.
    a11y: { test: 'error' },
  },
};
export default preview;
