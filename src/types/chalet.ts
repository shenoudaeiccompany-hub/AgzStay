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

export type AppSectionTab = 'browse' | 'price-guide' | 'host-dashboard';

export type VerificationStatus = 'unverified' | 'pending' | 'verified';

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
  phone: string;
  instaPayHandle?: string;
  verified: boolean;
  roleType?: AdvertiserRole;
  brokerAgency?: string;
  verificationStatus?: VerificationStatus;
  responseTime: string;
  memberSince: string;
}

export type ListingAvailabilityStatus = 'active' | 'rented';

export interface Chalet {
  id: string;
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

export interface BookingRequest {
  id: string;
  chaletId: string;
  chaletTitle: string;
  resort: string;
  destinationLabel: string;
  ownerName: string;
  ownerPhone: string;
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
  notes: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  confirmedAt?: string;
  cancelledAt?: string;
  cancellationDaysNotice?: number;
  depositForfeited?: boolean;
  forfeitedAmount?: number;
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
  ownerName: string;
  phone: string;
  documentType: 'resort-card' | 'ownership-contract' | 'authorization';
  documentNumber: string;
  documentPreviewName: string;
  status: VerificationStatus;
  submittedAt: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'guest' | 'owner';
  isLocalDemo?: boolean;
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
