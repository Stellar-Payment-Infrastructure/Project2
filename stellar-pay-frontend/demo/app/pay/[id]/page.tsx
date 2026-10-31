import { CheckoutClient } from './CheckoutClient';

export default function PayPage({ params }: { params: { id: string } }) {
  return <CheckoutClient paymentId={params.id} />;
}
