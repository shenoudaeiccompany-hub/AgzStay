export type RouteSection = 'home' | 'pricing' | 'owner' | 'admin';

export type PropertyType =
  | 'شقة مفروشة'
  | 'شقة فاضية'
  | 'شاليه'
  | 'فيلا'
  | 'استوديو';

export type AdvertiserRoleLabel = 'مالك مباشر' | 'مكتب / وسيط';

export type AdvertiserTypeCode = 'owner' | 'broker';

export type ProfileRole = 'guest' | 'owner' | 'admin';

export type DepositType = 'percent' | 'fixed';

export type AmenityId =
  | 'wifi'
  | 'ac'
  | 'elevator'
  | 'pool'
  | 'family'
  | 'sea-view'
  | 'garden'
  | 'parking';

export type ListingAvailabilityStatus = 'active' | 'hidden' | 'rented';

export type SortOption = 'featured' | 'price-asc' | 'price-desc';

export type ViewMode = 'grid' | 'map';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Chalet {
  id: string;
  ownerId?: string;
  isDemo?: boolean;
  title: string;
  description: string;
  governorate: string;
  city: string;
  areaOrVillage: string;
  propertyType: PropertyType;
  advertiserRole: AdvertiserRoleLabel;
  ownerName: string;
  /**
   * Optional: Only populated on local demo items or for the authenticated owner/admin
   * from `chalet_contacts`. Public listings in `chalets` do NOT expose phone numbers;
   * renters obtain contact details via `reveal_listing_contact`.
   */
  ownerPhone?: string;
  isFeatured: boolean;
  depositType: DepositType;
  depositValue: number;
  pricePerNight: number;
  monthlyPrice?: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm?: number;
  maxGuests: number;
  beachDistanceMeters?: number;
  coordinates: Coordinates;
  images: string[];
  amenities: AmenityId[];
  blockedDates: string[];
  rules: string[];
  availabilityStatus: ListingAvailabilityStatus;
  createdAt?: string;
}

export type SubscriptionPlanId = 'free' | 'starter' | 'pro' | 'enterprise';

export type SubscriptionStatus = 'pending' | 'active' | 'rejected' | 'expired';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  badge: string;
  price: number;
  maxUnits: number;
  features: string[];
  isFeaturedEligible: boolean;
  priorityLabel: string;
  sortOrder?: number;
}

export interface PendingSubscriptionInfo {
  id?: string;
  planId?: string;
  planName: string;
  createdAt?: string;
  status?: string;
}

export interface MySubscriptionSummary {
  planId: SubscriptionPlanId | string;
  planName: string;
  usedUnits: number;
  maxUnits: number;
  expiresAt?: string | null;
  status: 'active' | 'pending' | 'rejected' | 'free' | 'expired';
  isFeaturedEligible: boolean;
  pendingRequest: PendingSubscriptionInfo | null;
  adminNote?: string | null;
}

export interface SubscriptionRecord {
  id: string;
  userId?: string;
  ownerName: string;
  ownerPhone: string;
  planId: SubscriptionPlanId | string;
  planName: string;
  price: number;
  maxUnits: number;
  receiptPath?: string;
  receiptUrl?: string;
  status: SubscriptionStatus;
  adminNote?: string;
  expiresAt?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  advertiserType: AdvertiserTypeCode;
  role: ProfileRole;
  verificationStatus?: string;
}

export interface AuthUserSummary {
  id: string;
  email: string;
}

export interface FilterState {
  searchQuery: string;
  governorate: string;
  city: string;
  areaOrVillage: string;
  propertyType: PropertyType | 'الكل';
  advertiserRole: AdvertiserRoleLabel | 'الكل';
  maxPrice: number | null;
  checkInDate: string;
  checkOutDate: string;
  sortBy: SortOption;
  favoritesOnly: boolean;
}

export type RentalDuration = 'daily' | 'weekly' | 'monthly';

export interface BookingRangeLike {
  chaletId: string;
  checkIn: string;
  checkOut?: string;
  nights?: number;
  status?: string;
}
