import { PaymentCapabilities } from './payment-capabilities.interface';
import { PaymentConfig } from './payment-config.interface';
import { PaymentFeature } from '../enums';

export interface PaymentProvider<TCreateReq=unknown,TCreateRes=unknown,TVerifyReq=unknown,TVerifyRes=unknown,TRefundReq=unknown,TRefundRes=unknown>{
 initialize(config: PaymentConfig): Promise<void>|void;
 createPayment(request:TCreateReq):Promise<TCreateRes>;
 verifyPayment(request:TVerifyReq):Promise<TVerifyRes>;
 refundPayment?(request:TRefundReq):Promise<TRefundRes>;
 capturePayment?(transactionId:string):Promise<void>;
 cancelPayment?(transactionId:string):Promise<void>;
 handleWebhook?(payload:unknown,signature?:string):Promise<void>;
 verifySignature?(payload:string,signature:string):Promise<boolean>;
 supports(feature:PaymentFeature):boolean;
 getCapabilities():PaymentCapabilities;
}
