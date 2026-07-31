import { PaymentProvider } from './payment-provider.interface';
import { PaymentProvider as ProviderEnum } from '../enums';

export interface PaymentProviderFactory {
 resolve(provider: ProviderEnum): PaymentProvider;
}
