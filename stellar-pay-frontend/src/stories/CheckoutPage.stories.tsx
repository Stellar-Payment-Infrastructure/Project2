import type { Meta, StoryObj } from '@storybook/react';
import { CheckoutPage } from '../components/CheckoutPage';
import { WalletProvider } from '../wallet/WalletProvider';
import { STORY_PAYMENT_ID, storyClient, storyPayment, storyWallet } from './storyFakes';

const meta: Meta<typeof CheckoutPage> = {
  title: 'Checkout/CheckoutPage',
  component: CheckoutPage,
  decorators: [
    (Story) => (
      <WalletProvider adapter={storyWallet}>
        <Story />
      </WalletProvider>
    ),
  ],
  args: { paymentId: STORY_PAYMENT_ID, checkoutUrl: `https://pay.example/pay/${STORY_PAYMENT_ID}` },
};
export default meta;
type Story = StoryObj<typeof CheckoutPage>;

export const Loading: Story = { args: { client: storyClient('loading') } };
export const WaitingForPayment: Story = { args: { client: storyClient(storyPayment()) } };
export const Paid: Story = { args: { client: storyClient(storyPayment({ status: 'paid' })) } };
export const Settled: Story = { args: { client: storyClient(storyPayment({ status: 'settled' })) } };
export const Refunded: Story = { args: { client: storyClient(storyPayment({ status: 'refunded' })) } };
export const Cancelled: Story = { args: { client: storyClient(storyPayment({ status: 'cancelled' })) } };
export const InvalidLink: Story = { args: { client: storyClient(null) } };
