import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  getBookingReceiptSignedUrl,
  submitBookingPaymentReceiptRpc,
  uploadPaymentReceipt,
  type RepoResult,
} from '@/services/agzstayRepository';
import type { BookingRequest } from '@/types/chalet';

export type PaymentProviderId = 'manual_transfer' | 'paymob' | 'fawry';

export interface DepositInitiationContext {
  booking: BookingRequest;
  ownerInstaPay?: string | null;
  ownerPhone?: string | null;
}

export interface PaymentInitiationResult {
  providerId: PaymentProviderId;
  mode: 'manual_receipt' | 'redirect_checkout';
  instructionsTitle: string;
  instructionsBody: string;
  redirectUrl?: string;
}

export interface SubmitPaymentProofPayload {
  bookingId: string;
  file: File;
  reference?: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  readonly supportsInstantCheckout: boolean;
  initiateDeposit(context: DepositInitiationContext): Promise<RepoResult<PaymentInitiationResult>>;
  submitPaymentProof(payload: SubmitPaymentProofPayload): Promise<RepoResult<BookingRequest>>;
  confirmPaymentOwner?(bookingId: string): Promise<RepoResult<BookingRequest>>;
  getReceiptPreviewUrl(receiptPath?: string): Promise<RepoResult<string>>;
}

export class ManualTransferProvider implements PaymentProvider {
  readonly id: PaymentProviderId = 'manual_transfer';
  readonly displayName = 'تحويل يدوي (InstaPay / محفظة إلكترونية)';
  readonly supportsInstantCheckout = false;

  async initiateDeposit(
    context: DepositInitiationContext
  ): Promise<RepoResult<PaymentInitiationResult>> {
    const target =
      context.ownerInstaPay ||
      context.ownerPhone ||
      'تواصل مع المالك عبر الطلب للحصول على حساب التحويل';

    return {
      data: {
        providerId: this.id,
        mode: 'manual_receipt',
        instructionsTitle: 'تحويل جدية الحجز عبر InstaPay أو المحفظة',
        instructionsBody: `حوّل مبلغ جدية الحجز إلى: ${target} ثم ارفع صورة إيصال التحويل لتأكيد الموعد.`,
      },
      error: null,
    };
  }

  async submitPaymentProof(
    payload: SubmitPaymentProofPayload
  ): Promise<RepoResult<BookingRequest>> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        data: null,
        error: 'وضع تجريبي: رفع إيصال الدفع غير متاح بدون إعداد Supabase.',
      };
    }

    const uploadRes = await uploadPaymentReceipt(payload.file);
    if (uploadRes.error || !uploadRes.data) {
      return {
        data: null,
        error: uploadRes.error ?? 'تعذر رفع صورة إيصال العربون.',
      };
    }

    return submitBookingPaymentReceiptRpc({
      bookingId: payload.bookingId,
      receiptPath: uploadRes.data.path,
      paymentProvider: this.id,
      paymentReference: payload.reference,
    });
  }

  async getReceiptPreviewUrl(receiptPath?: string): Promise<RepoResult<string>> {
    return getBookingReceiptSignedUrl(receiptPath);
  }
}

const manualTransferProvider = new ManualTransferProvider();

/**
 * Pluggable payment provider registry.
 * Future online PSP adapters (e.g., Paymob / Fawry via Supabase Edge Functions)
 * can implement PaymentProvider and register here without changing any UI screens.
 */
const PROVIDERS: Partial<Record<PaymentProviderId, PaymentProvider>> = {
  manual_transfer: manualTransferProvider,
};

export function getPaymentProvider(providerId: PaymentProviderId = 'manual_transfer'): PaymentProvider {
  return PROVIDERS[providerId] ?? manualTransferProvider;
}
