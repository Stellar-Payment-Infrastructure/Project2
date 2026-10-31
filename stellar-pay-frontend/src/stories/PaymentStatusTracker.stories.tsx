import type { Meta, StoryObj } from '@storybook/react';
import { PaymentStatusTracker } from '../components/PaymentStatusTracker';

const meta: Meta<typeof PaymentStatusTracker> = { title: 'Checkout/PaymentStatusTracker', component: PaymentStatusTracker };
export default meta;
type Story = StoryObj<typeof PaymentStatusTracker>;

export const Loading: Story = { args: { status: 'loading' } };
export const Waiting: Story = { args: { status: 'created' } };
export const Processing: Story = { args: { status: 'processing' } };
export const Paid: Story = { args: { status: 'paid' } };
export const Settled: Story = { args: { status: 'settled' } };
export const Failed: Story = { args: { status: 'failed' } };
export const Refunded: Story = { args: { status: 'refunded' } };
export const Expired: Story = { args: { status: 'expired' } };
export const Unknown: Story = { args: { status: 'unknown' } };
