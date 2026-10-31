import type { Meta, StoryObj } from '@storybook/react';
import { PaymentButton } from '../components/PaymentButton';
import { PaymentLinkGenerator } from '../components/PaymentLinkGenerator';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { STORY_PAYMENT_ID } from './storyFakes';

const meta: Meta = { title: 'Merchant/Components' };
export default meta;

export const PayButton: StoryObj<typeof PaymentButton> = {
  render: () => <PaymentButton createCheckout={async () => ({ checkoutUrl: '#' })} onCheckout={() => undefined} />,
};
export const PayButtonError: StoryObj<typeof PaymentButton> = {
  render: () => <PaymentButton createCheckout={() => Promise.reject(new Error('server down'))} />,
};
export const LinkGenerator: StoryObj<typeof PaymentLinkGenerator> = {
  render: () => <PaymentLinkGenerator checkoutBaseUrl="https://pay.example" paymentId={STORY_PAYMENT_ID} />,
};
export const QRCode: StoryObj<typeof QRCodeDisplay> = {
  render: () => <QRCodeDisplay value={`https://pay.example/pay/${STORY_PAYMENT_ID}`} showValue />,
};
