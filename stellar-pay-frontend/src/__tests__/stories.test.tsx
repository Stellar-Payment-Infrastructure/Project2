import { composeStories } from '@storybook/react';
import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import * as checkout from '../stories/CheckoutPage.stories';
import * as merchant from '../stories/Merchant.stories';
import * as tracker from '../stories/PaymentStatusTracker.stories';
import { expectNoA11yViolations } from './fakes';

const prefixed = (prefix: string, stories: Record<string, () => JSX.Element | null>) =>
  Object.entries(stories).map(([name, Story]) => [`${prefix}/${name}`, Story] as const);
const all = [
  ...prefixed('CheckoutPage', composeStories(checkout)),
  ...prefixed('PaymentStatusTracker', composeStories(tracker)),
  ...prefixed('Merchant', composeStories(merchant)),
];

describe('every story renders without accessibility violations', () => {
  it('covers all 20 stories', () => {
    if (all.length !== 20) throw new Error(`expected 20 stories, got ${all.length}`);
  });
  for (const [name, Story] of all) {
    it(name, async () => {
      const { container } = render(<Story />);
      await new Promise((r) => setTimeout(r, 30));
      await expectNoA11yViolations(container);
    });
  }
});
