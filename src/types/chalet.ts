export type DestinationId =
  | 'all'
  | 'greater-cairo'
  | 'north-coast'
  | 'ain-sokhna'
  | 'alexandria'
  | 'red-sea-sinai'
  | 'marsa-matrouh'
  | 'delta-upper'
  | 'el-gouna'
  | 'dahab';

export type GovernorateId =
  | 'all'
  | 'greater-cairo'
  | 'north-coast'
  | 'ain-sokhna'
  | 'alexandria'
  | 'red-sea-sinai'
  | 'marsa-matrouh'
  | 'delta-upper';

export type RentalDuration = 'daily' | 'weekly' | 'monthly';

export type AmenityId =
  | 'wifi'
  | 'ac'
  | 'elevator'
  | 'pool'
  | 'family'
  | 'sea-view'
  | 'garden'
  | 'parking';

export type UnitType =
  | 'furnished-apartment'
  | 'studio'
  | 'chalet'
  | 'villa'
  | 'duplex'
  | 'ground-garden'
  | 'penthouse';

export type ViewType = 'sea-front' | 'lagoon' | 'pool' | 'garden' | 'city-nile';

export type AdvertiserRole = 'owner' | 'founding-owner' | 'broker';

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

export type ViewMode = 'grid' | 'map';

export type UserMode = 'renter' | 'host';

export type AppSectionTab = 'browse' | 'price-guide' | 'host-dashboard' | 'admin';

export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export type HostTier = 'free' | 'pro';

export type SubscriptionStatus = 'active' | 'pending-verification' | 'expired';

export type PaymentMethod =
  | 'instapay'
  | 'vodafone-cash'
  | 'orange-cash'
  | 'etisalat-cash';

export interface WelcomeGuideInfo {
  wifiName: string;
  wifiPassword: string;
  gateInstructions: string;
  caretakerName: string;
  caretakerPhone: string;
  mapsUrl?: string;
}

export interface HostSubscriptionRecord {
  id: string;
  hostId?: string;
  hostName: string;
  hostPhone: string;
  tier: HostTier;
  status: SubscriptionStatus;
  monthlyFee: number;
  paymentMethod?: PaymentMethod;
  senderPhoneOrHandle?: string;
  transferReference?: string;
  receiptPath?: string;
  receiptPreviewUrl?: string;
  startDate: string;
  expiryDate: string;
  submittedAt?: string;
  reviewedAt?: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface NearbyHighlight {
  category: 'market' | 'beach' | 'dining' | 'pharmacy';
  name: string;
  distance: string;
}

export type DepositType = 'percent' | 'fixed';

export interface DateRule {
  status?: 'available' | 'blocked';
  nightlyPrice?: number;
  note?: string;
  depositType?: DepositType;
  depositValue?: number;
}

export interface ChaletOwner {
  name: string;
  phone?: string;
  instaPayHandle?: string;
  verified: boolean;
  roleType?: AdvertiserRole;
  brokerAgency?: string;
  verificationStatus?: VerificationStatus;
  responseTime: string;
  memberSince: string;
}

export type ListingAvailabilityStatus =
  | 'active'
  | 'rented'
  | 'draft'
  | 'pending_review'
  | 'hidden';

export interface Chalet {
  id: string;
  ownerId?: string;
  isDemo?: boolean;
  unitNumber?: number;
  title: string;
  listingMode?: 'rent';
  availabilityStatus?: ListingAvailabilityStatus;
  supportedDurations?: RentalDuration[];
  destination: Exclude<DestinationId, 'all'>;
  governorate?: Exclude<GovernorateId, 'all'>;
  area?: string;
  destinationLabel: string;
  resort: string;
  unitType: UnitType;
  viewType: ViewType;
  includesPasses: boolean;
  verifiedLivePhotos?: boolean;
  livePhotosVerifiedAt?: string;
  welcomeGuide?: WelcomeGuideInfo;
  hostTier?: HostTier;
  pricePerNight: number;
  weeklyPrice?: number;
  monthlyPrice?: number;
  weekendPricePerNight?: number;
  peakPricePerNight?: number;
  securityDeposit?: number;
  downPaymentPercent?: number;
  depositType?: DepositType;
  fixedDepositAmount?: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm?: number;
  maxGuests: number;
  beachDistanceMeters: number;
  coordinates: Coordinates;
  rating: number;
  reviewsCount: number;
  images: string[];
  amenities: AmenityId[];
  blockedDates?: string[];
  dateRules?: Record<string, DateRule>;
  nearbyHighlights?: NearbyHighlight[];
  description: string;
  rules: string[];
  owner: ChaletOwner;
  featured?: boolean;
}

export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'payment_submitted'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'expired'
  | 'pending_verification';

export interface BookingRequest {
  id: string;
  chaletId: string;
  renterId?: string;
  chaletTitle: string;
  resort: string;
  destinationLabel: string;
  ownerName: string;
  ownerPhone?: string;
  ownerInstaPay?: string;
  guestName: string;
  guestPhone: string;
  checkIn: string;
  checkOut?: string;
  nights: number;
  rentalDuration?: RentalDuration;
  inquiryChannel?: 'form' | 'whatsapp' | 'phone';
  guests: number;
  totalPrice: number;
  depositAmount?: number;
  remainingAmount?: number;
  securityDeposit?: number;
  policyAccepted?: boolean;
  receiptPath?: string;
  receiptPreviewUrl?: string;
  paymentProvider?: string;
  paymentReference?: string;
  notes: string;
  status: BookingStatus;
  rejectionReason?: string;
  approvedAt?: string;
  paymentSubmittedAt?: string;
  confirmedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  cancellationDaysNotice?: number;
  depositForfeited?: boolean;
  forfeitedAmount?: number;
  createdAt: string;
}

export interface BookedDateRange {
  chaletId: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
}

export interface RevealedOwnerContact {
  ownerPhone: string | null;
  instaPayHandle: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  bookingId?: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface FilterState {
  searchQuery: string;
  rentalDuration: RentalDuration;
  checkInDate: string;
  checkOutDate: string;
  governorate: GovernorateId;
  area: string;
  destination: DestinationId;
  amenities: AmenityId[];
  unitType: UnitType | 'all';
  viewType: ViewType | 'all';
  minBedrooms: number;
  passesOnly: boolean;
  directOwnersOnly: boolean;
  maxPrice: number | null;
  minGuests: number;
  sortBy: SortOption;
  favoritesOnly: boolean;
}

export interface ListingReport {
  id: string;
  chaletId: string;
  reason: string;
  details: string;
  createdAt: string;
}

export type PropertyReviewTag =
  | 'مطابقة الصور للواقع'
  | 'نظافة الوحدة'
  | 'شفافية السعر وعدم وجود عمولات خفية';

export type RenterTrustTag = 'الالتزام بالمواعيد' | 'المحافظة على الوحدة';

export interface ChaletReview {
  id: string;
  chaletId: string;
  bookingId: string;
  authorName: string;
  rating: number;
  tags?: PropertyReviewTag[];
  comment: string;
  stayDate: string;
  createdAt: string;
}

export interface RenterTrustReview {
  id: string;
  renterName: string;
  renterPhone: string;
  hostName: string;
  bookingId: string;
  chaletTitle: string;
  rating: number;
  punctualityScore: number;
  propertyCareScore: number;
  tags: RenterTrustTag[];
  comment: string;
  createdAt: string;
}

export interface OwnerVerificationSubmission {
  id?: string;
  ownerId?: string;
  ownerName: string;
  phone: string;
  documentType: 'resort-card' | 'ownership-contract' | 'authorization';
  documentNumber: string;
  documentPath?: string;
  documentPreviewName: string;
  status: VerificationStatus;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'guest' | 'owner' | 'admin';
  verificationStatus?: VerificationStatus;
  advertiserType?: 'owner' | 'broker';
}

export interface MarketBenchmarkEntry {
  id: string;
  areaName: string;
  governorateLabel: string;
  category: 'residential' | 'coastal';
  dailyWeekdayAvg: number;
  dailyWeekendAvg: number;
  monthlyAvg: number;
  demandLevel: 'مرتفع جداً' | 'مرتفع' | 'متوازن';
  tip: string;
}
