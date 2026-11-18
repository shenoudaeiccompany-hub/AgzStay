import type {
  AdvertiserRole,
  AmenityId,
  BookingRequest,
  Chalet,
  Coordinates,
  DestinationId,
  GovernorateId,
  MarketBenchmarkEntry,
  RentalDuration,
  RenterTrustReview,
  UnitType,
  ViewType,
} from '@/types/chalet';

export interface GovernorateConfig {
  id: GovernorateId;
  label: string;
  subtitle: string;
  areas: string[];
  defaultCoordinates: Coordinates;
}

export const GOVERNORATES: GovernorateConfig[] = [
  {
    id: 'all',
    label: 'كل مصر',
    subtitle: 'جميع المحافظات والمدن الساحلية',
    areas: [],
    defaultCoordinates: { lat: 29.9, lng: 31.1 },
  },
  {
    id: 'greater-cairo',
    label: 'القاهرة الكبرى',
    subtitle: 'القاهرة الجديدة، زايد، أكتوبر، المعادي، الزمالك',
    areas: [
      'مدينة نصر',
      'مصر الجديدة',
      'التجمع الخامس',
      'المعادي',
      'الزمالك',
      'المهندسين',
      'الدقي',
      'الهرم',
      'فيصل',
      'حدائق أكتوبر',
      'الشيخ زايد',
      '6 أكتوبر',
    ],
    defaultCoordinates: { lat: 30.0444, lng: 31.2357 },
  },
  {
    id: 'north-coast',
    label: 'الساحل الشمالي',
    subtitle: 'مراسي، هاسيندا، مارينا، العلمين الجديدة',
    areas: ['مراسي', 'هاسيندا', 'مارينا', 'العلمين الجديدة', 'فوكا باي'],
    defaultCoordinates: { lat: 30.985, lng: 28.72 },
  },
  {
    id: 'ain-sokhna',
    label: 'العين السخنة',
    subtitle: 'بورتو السخنة، لاسيرينا، بلو باي، ستيلا',
    areas: ['بورتو السخنة', 'لاسيرينا', 'بلو باي', 'ستيلا', 'المونت جلالة'],
    defaultCoordinates: { lat: 29.51, lng: 32.38 },
  },
  {
    id: 'alexandria',
    label: 'الإسكندرية',
    subtitle: 'ميامي، سيدي جابر، كفر عبده، المعمورة',
    areas: ['ميامي', 'سيدي جابر', 'كفر عبده', 'المعمورة'],
    defaultCoordinates: { lat: 31.235, lng: 29.955 },
  },
  {
    id: 'red-sea-sinai',
    label: 'البحر الأحمر وسيناء',
    subtitle: 'الغردقة، الجونة، شرم الشيخ، دهب، رأس سدر، مرسى علم',
    areas: ['الغردقة', 'الجونة', 'شرم الشيخ', 'دهب', 'رأس سدر', 'مرسى علم'],
    defaultCoordinates: { lat: 27.395, lng: 33.678 },
  },
  {
    id: 'marsa-matrouh',
    label: 'مرسى مطروح',
    subtitle: 'عجيبة، الأبيض، علم الروم',
    areas: ['عجيبة', 'الأبيض', 'علم الروم'],
    defaultCoordinates: { lat: 31.38, lng: 27.15 },
  },
  {
    id: 'delta-upper',
    label: 'باقي المحافظات (الدلتا والصعيد)',
    subtitle: 'المنصورة، طنطا، الإسماعيلية، بورسعيد، الأقصر، أسوان',
    areas: ['المنصورة', 'طنطا', 'الإسماعيلية', 'بورسعيد', 'الأقصر', 'أسوان'],
    defaultCoordinates: { lat: 31.0409, lng: 31.3785 },
  },
];

export const DESTINATION_DEFAULT_COORDINATES: Record<
  Exclude<DestinationId, 'all'>,
  Coordinates
> = {
  'greater-cairo': { lat: 30.0444, lng: 31.2357 },
  'north-coast': { lat: 30.985, lng: 28.72 },
  'ain-sokhna': { lat: 29.51, lng: 32.38 },
  alexandria: { lat: 31.235, lng: 29.955 },
  'red-sea-sinai': { lat: 27.395, lng: 33.678 },
  'marsa-matrouh': { lat: 31.38, lng: 27.15 },
  'delta-upper': { lat: 31.0409, lng: 31.3785 },
  'el-gouna': { lat: 27.395, lng: 33.678 },
  dahab: { lat: 28.485, lng: 34.505 },
};

export const DESTINATIONS: { id: DestinationId; label: string; subtitle: string }[] =
  GOVERNORATES.map((g) => ({
    id: g.id,
    label: g.label,
    subtitle: g.subtitle,
  }));

export const AMENITIES: { id: AmenityId; label: string }[] = [
  { id: 'wifi', label: 'واي فاي فائق السرعة' },
  { id: 'ac', label: 'تكييف بالكامل' },
  { id: 'elevator', label: 'أسانسير' },
  { id: 'pool', label: 'حمام سباحة' },
  { id: 'family', label: 'مناسب للعائلات فقط' },
  { id: 'sea-view', label: 'إطلالة على البحر' },
  { id: 'garden', label: 'حديقة خاصة' },
  { id: 'parking', label: 'موقف سيارات' },
];

export const UNIT_TYPES: { id: UnitType | 'all'; label: string }[] = [
  { id: 'all', label: 'كل الأنواع' },
  { id: 'furnished-apartment', label: 'شقة مفروشة' },
  { id: 'studio', label: 'استوديو' },
  { id: 'chalet', label: 'شاليه' },
  { id: 'villa', label: 'فيلا / توين هاوس' },
  { id: 'duplex', label: 'دوبلكس' },
];

export const RENTAL_DURATIONS: { id: RentalDuration; label: string }[] = [
  { id: 'daily', label: 'يومي' },
  { id: 'weekly', label: 'أسبوعي' },
  { id: 'monthly', label: 'شهري' },
];

export const VIEW_TYPES: { id: ViewType | 'all'; label: string }[] = [
  { id: 'all', label: 'كل الإطلالات' },
  { id: 'sea-front', label: 'صف أول بحر' },
  { id: 'lagoon', label: 'كريستال لاجون' },
  { id: 'pool', label: 'حمام سباحة' },
  { id: 'garden', label: 'حديقة ومناظر خضراء' },
  { id: 'city-nile', label: 'إطلالة مدينة / نيل' },
];

export const PROPERTY_REVIEW_TAGS = [
  'مطابقة الصور للواقع',
  'نظافة الوحدة',
  'شفافية السعر وعدم وجود عمولات خفية',
] as const;

export const RENTER_TRUST_TAGS = [
  'الالتزام بالمواعيد',
  'المحافظة على الوحدة',
] as const;

function offsetIsoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const INITIAL_CHALETS: Chalet[] = [
  {
    id: 'prop-cairo-tagamoa-1',
    title: 'شقة مفروشة الترا سوبر لوكس بالتجمع الخامس قرب الجامعة الأمريكية',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'greater-cairo',
    governorate: 'greater-cairo',
    area: 'التجمع الخامس',
    destinationLabel: 'القاهرة الكبرى',
    resort: 'التجمع الخامس - اللوتس',
    unitType: 'furnished-apartment',
    viewType: 'garden',
    includesPasses: true,
    pricePerNight: 2400,
    weeklyPrice: 15200,
    monthlyPrice: 44000,
    weekendPricePerNight: 2650,
    peakPricePerNight: 2900,
    securityDeposit: 5000,
    downPaymentPercent: 20,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 175,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0258, lng: 31.4913 },
    rating: 4.9,
    reviewsCount: 31,
    featured: true,
    blockedDates: [offsetIsoDate(3), offsetIsoDate(4)],
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family', 'parking'],
    nearbyHighlights: [
      { category: 'market', name: 'سوبر ماركت سعودي - شارع التسعين', distance: '٤ دقائق' },
      { category: 'dining', name: 'بوينت ٩٠ مول وكافيهات الجامعة', distance: '٥ دقائق' },
      { category: 'pharmacy', name: 'صيدلية سيف (٢٤ ساعة)', distance: '٣ دقائق' },
    ],
    description:
      'شقة مفروشة بالكامل بأثاث مودرن جديد في كمبوند هادئ بالتجمع الخامس، مكيفة بالكامل مع إنترنت فايبر فائق السرعة ومصعد كهربائي وموقف خاص للسيارة.',
    rules: [
      'العائلات أو المهندسين والوافدين فقط',
      'تأمين مسترد عند تسليم المفاتيح',
      'ممنوع الحفلات أو إزعاج الجيران',
    ],
    owner: {
      name: 'م. شريف عبد الرحمن',
      phone: '01001122334',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٠ دقائق',
      memberSince: '٢٠٢١',
    },
  },
  {
    id: 'prop-cairo-nasrcity-1',
    title: 'شقة مفروشة راقية بشارع عباس العقاد مباشرة — أسانسير وواي فاي',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'greater-cairo',
    governorate: 'greater-cairo',
    area: 'مدينة نصر',
    destinationLabel: 'القاهرة الكبرى',
    resort: 'مدينة نصر - عباس العقاد',
    unitType: 'furnished-apartment',
    viewType: 'city-nile',
    includesPasses: true,
    pricePerNight: 1850,
    weeklyPrice: 11500,
    monthlyPrice: 32000,
    weekendPricePerNight: 2050,
    peakPricePerNight: 2250,
    securityDeposit: 3000,
    downPaymentPercent: 20,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 155,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0609, lng: 31.3372 },
    rating: 4.75,
    reviewsCount: 44,
    featured: true,
    dateRules: {
      '2026-11-20': {
        status: 'available',
        nightlyPrice: 2100,
        note: 'عرض ويك إند شامل الإنترنت السريع',
      },
      '2026-11-21': {
        status: 'available',
        nightlyPrice: 2100,
        note: 'عرض ويك إند شامل الإنترنت السريع',
      },
      '2026-11-22': {
        status: 'available',
        nightlyPrice: 1750,
        note: 'سعر مخفض لليالي وسط الأسبوع',
      },
      '2026-11-23': {
        status: 'available',
        nightlyPrice: 1750,
        note: 'سعر مخفض لليالي وسط الأسبوع',
      },
    },
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family'],
    nearbyHighlights: [
      { category: 'market', name: 'كارفور جنينة مول', distance: '٣ دقائق مشياً' },
      { category: 'dining', name: 'سيتي ستارز ومطاعم عباس العقاد', distance: '٥ دقائق' },
      { category: 'pharmacy', name: 'صيدلية العزبي عباس العقاد', distance: 'دقيقتان' },
    ],
    description:
      'موقع حيوي قريب من سيتي ستارز ومطار القاهرة الدولي. الشقة مجهزة بـ ٣ مكيفات سبليت ومطبخ أمريكي متكامل وغسالة أوتوماتيك وإنترنت فايبر ١٠٠ ميجا.',
    rules: [
      'استلام رسمي بعقد إيجار مفروش قصير أو شهري',
      'مناسب للعائلات والعاملين بالشركات',
    ],
    owner: {
      name: 'أ. هبة مصطفى',
      phone: '01112233445',
      instaPayHandle: 'heba.mostafa@instapay',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٠ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'prop-cairo-zamalek-1',
    title: 'استوديو فندقي بإطلالة جانبية على النيل في الزمالك',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'greater-cairo',
    governorate: 'greater-cairo',
    area: 'الزمالك',
    destinationLabel: 'القاهرة الكبرى',
    resort: 'الزمالك - شارع ٢٦ يوليو',
    unitType: 'studio',
    viewType: 'city-nile',
    includesPasses: true,
    pricePerNight: 2900,
    weeklyPrice: 18500,
    monthlyPrice: 52000,
    weekendPricePerNight: 3200,
    peakPricePerNight: 3500,
    securityDeposit: 4000,
    downPaymentPercent: 25,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 75,
    maxGuests: 2,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0609, lng: 31.2197 },
    rating: 4.88,
    reviewsCount: 27,
    images: [
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator'],
    nearbyHighlights: [
      { category: 'dining', name: 'كافيهات ومطاعم الزمالك المطلة على النيل', distance: 'دقيقتان مشياً' },
      { category: 'market', name: 'أوسكار ماركت الزمالك', distance: '٣ دقائق' },
    ],
    description:
      'استوديو راقٍ بديكور فندقي هادئ في قلب الزمالك، مثالي لرحلات العمل والإقامات الدبلوماسية والسياحية مع خدمة تنظيف أسبوعية مجانية.',
    rules: [
      'إبراز تحقيق الشخصية عند الاستلام',
      'ممنوع التدخين داخل الغرفة',
    ],
    owner: {
      name: 'شركة النيل للعقارات الموثقة',
      phone: '01229988776',
      verified: true,
      roleType: 'broker',
      brokerAgency: 'النيل بروبرتي مانجمنت',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٥ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'prop-giza-mohandessin-1',
    title: 'دوبلكس فاخر مفروش بشارع جامعة الدول العربية — المهندسين',
    listingMode: 'rent',
    supportedDurations: ['weekly', 'monthly'],
    destination: 'greater-cairo',
    governorate: 'greater-cairo',
    area: 'المهندسين',
    destinationLabel: 'القاهرة الكبرى',
    resort: 'المهندسين - جامعة الدول',
    unitType: 'duplex',
    viewType: 'city-nile',
    includesPasses: true,
    pricePerNight: 3100,
    weeklyPrice: 19500,
    monthlyPrice: 58000,
    weekendPricePerNight: 3400,
    securityDeposit: 6000,
    bedrooms: 4,
    bathrooms: 3,
    areaSqm: 260,
    maxGuests: 8,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0566, lng: 31.2016 },
    rating: 4.8,
    reviewsCount: 19,
    images: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family', 'parking'],
    nearbyHighlights: [
      { category: 'dining', name: 'مطاعم وكافيهات جامعة الدول العربية', distance: 'دقيقتان مشياً' },
      { category: 'pharmacy', name: 'صيدليات الدقي والمهندسين', distance: '٣ دقائق' },
    ],
    description:
      'دوبلكس عائلي واسع في برج راقٍ بأسانسير حديث وحراسة ٢٤ ساعة، قريب من السفارات وميدان مصطفى محمود.',
    rules: ['مناسب للعائلات الكبيرة والزوار العرب', 'الحد الأدنى أسبوع'],
    owner: {
      name: 'الرواد للاستثمار العقاري',
      phone: '01145566778',
      verified: true,
      roleType: 'broker',
      brokerAgency: 'الرواد بروكرز المعتمدة',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٥ دقيقة',
      memberSince: '٢٠٢٣',
    },
  },
  {
    id: 'chalet-marassi-1',
    title: 'شاليه صف أول بحر مع تراس خاص في مراسي سيدي عبد الرحمن',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly'],
    destination: 'north-coast',
    governorate: 'north-coast',
    area: 'مراسي',
    destinationLabel: 'الساحل الشمالي',
    resort: 'مراسي - سيدي عبد الرحمن',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 8500,
    weeklyPrice: 54000,
    weekendPricePerNight: 9800,
    peakPricePerNight: 11200,
    securityDeposit: 3000,
    downPaymentPercent: 30,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 150,
    maxGuests: 6,
    beachDistanceMeters: 80,
    coordinates: { lat: 30.9672, lng: 28.7423 },
    rating: 4.9,
    reviewsCount: 38,
    featured: true,
    blockedDates: [offsetIsoDate(5), offsetIsoDate(6)],
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'wifi', 'family', 'parking'],
    nearbyHighlights: [
      { category: 'beach', name: 'شاطئ سول وممشى مراسي', distance: 'دقيقتان مشياً' },
      { category: 'market', name: 'سوبر ماركت سي وورلد مراسي', distance: '٣٠٠م' },
      { category: 'dining', name: 'مارينا المطاعم والكافيهات', distance: '٤ دقائق' },
      { category: 'pharmacy', name: 'صيدلية العزبي - بوابة مراسي', distance: '٥ دقائق' },
    ],
    description:
      'شاليه فاخر بتشطيب فندقي في قلب مراسي، يبعد خطوات عن الشاطئ والكريستال لاجونز. مجهز بالكامل بمطبخ أمريكي حديث، جلسة خارجية مطلة على حمام السباحة، وشامل تصاريح الدخول.',
    rules: [
      'العائلات فقط أو مجموعات هادئة',
      'تسجيل الدخول ٢ عصراً والمغادرة ١٢ ظهراً',
      'ممنوع اصطحاب الحيوانات الأليفة',
    ],
    owner: {
      name: 'م. طارق المنشاوي',
      phone: '01001234567',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٥ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'chalet-sokhna-1',
    title: 'شاليه أرضي بحديقة خاصة في المونت جلالة العين السخنة',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly'],
    destination: 'ain-sokhna',
    governorate: 'ain-sokhna',
    area: 'المونت جلالة',
    destinationLabel: 'العين السخنة',
    resort: 'المونت جلالة',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 4200,
    weeklyPrice: 27000,
    weekendPricePerNight: 4900,
    peakPricePerNight: 5600,
    securityDeposit: 1500,
    downPaymentPercent: 25,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 115,
    maxGuests: 5,
    beachDistanceMeters: 150,
    coordinates: { lat: 29.5206, lng: 32.3694 },
    rating: 4.8,
    reviewsCount: 54,
    featured: true,
    blockedDates: [offsetIsoDate(8), offsetIsoDate(9)],
    images: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'garden', 'family', 'parking'],
    nearbyHighlights: [
      { category: 'beach', name: 'شاطئ المونت جلالة والكريستال لاجون', distance: '٣ دقائق' },
      { category: 'market', name: 'ماركت بيزنس بارك المونت', distance: '٤٠٠م' },
      { category: 'dining', name: 'منطقة كافيهات الكلوب هاوس', distance: '٥ دقائق' },
    ],
    description:
      'شاليه بانوراما على ارتفاع هادئ في المونت جلالة يجمع بين إطلالة البحر والجبل. حديقة خاصة مزودة بشواية وجلسة مسائية، وتكييفات في جميع الغرف.',
    rules: [
      'دفع تأمين مسترد عند الاستلام',
      'الالتزام بقواعد القرية والهدوء ليلاً',
      'يشمل تصاريح دخول البوابات واللاجون',
    ],
    owner: {
      name: 'أ. نادية الشريف',
      phone: '01119876543',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٣٠ دقيقة',
      memberSince: '٢٠٢١',
    },
  },
  {
    id: 'chalet-sokhna-porto-1',
    title: 'شاليه مطل على المارينا في بورتو السخنة — إيجار ويك إند وأسبوعي',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly'],
    destination: 'ain-sokhna',
    governorate: 'ain-sokhna',
    area: 'بورتو السخنة',
    destinationLabel: 'العين السخنة',
    resort: 'بورتو السخنة - الأبراج',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: false,
    pricePerNight: 2800,
    weeklyPrice: 17500,
    weekendPricePerNight: 3300,
    peakPricePerNight: 3800,
    securityDeposit: 1000,
    downPaymentPercent: 20,
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 100,
    maxGuests: 5,
    beachDistanceMeters: 90,
    coordinates: { lat: 29.4525, lng: 32.4561 },
    rating: 4.65,
    reviewsCount: 33,
    images: [
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'elevator', 'family'],
    description:
      'موقع مميز على بعد ساعة ونصف من القاهرة بأسانسير مباشر للمارينا والمطاعم والتلفريك.',
    rules: ['العائلات فقط', 'تأمين 1000 ج.م يسترد عند المغادرة'],
    owner: {
      name: 'أ. حسام الدسوقي',
      phone: '01552233445',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٤٥ دقيقة',
      memberSince: '٢٠٢١',
    },
  },
  {
    id: 'prop-alex-kafrabdo-1',
    title: 'شقة مفروشة كلاسيكية راقية في قلب كفر عبده الإسكندرية',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'alexandria',
    governorate: 'alexandria',
    area: 'كفر عبده',
    destinationLabel: 'الإسكندرية',
    resort: 'كفر عبده - رشدي',
    unitType: 'furnished-apartment',
    viewType: 'garden',
    includesPasses: true,
    pricePerNight: 2100,
    weeklyPrice: 13000,
    monthlyPrice: 36000,
    weekendPricePerNight: 2400,
    peakPricePerNight: 2800,
    securityDeposit: 3000,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 180,
    maxGuests: 6,
    beachDistanceMeters: 900,
    coordinates: { lat: 31.2248, lng: 29.9532 },
    rating: 4.86,
    reviewsCount: 24,
    featured: true,
    images: [
      'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family', 'parking'],
    nearbyHighlights: [
      { category: 'dining', name: 'كافيهات ومطاعم كفر عبده التراثية', distance: '٣ دقائق مشياً' },
      { category: 'market', name: 'مترو ماركت رشدي', distance: '٤ دقائق' },
    ],
    description:
      'شقة هادئة محاطة بالأشجار في أرقى شوارع كفر عبده، مناسبة للعائلات والإقامات الشهرية والطبية، مكيفة بالكامل ومزودة بمصعد وواي فاي سريع.',
    rules: ['العائلات فقط', 'الحفاظ على هدوء العقار'],
    owner: {
      name: 'م. داليا السعدني',
      phone: '01201122334',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٠ دقيقة',
      memberSince: '٢٠٢١',
    },
  },
  {
    id: 'prop-alex-miami-1',
    title: 'شقة مصيف ترى البحر بوضوح في ميامي على الكورنيش',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'alexandria',
    governorate: 'alexandria',
    area: 'ميامي',
    destinationLabel: 'الإسكندرية',
    resort: 'ميامي - شارع خالد بن الوليد',
    unitType: 'furnished-apartment',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 1650,
    weeklyPrice: 10200,
    monthlyPrice: 27000,
    weekendPricePerNight: 1950,
    peakPricePerNight: 2400,
    securityDeposit: 1500,
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 110,
    maxGuests: 5,
    beachDistanceMeters: 60,
    coordinates: { lat: 31.2678, lng: 29.9927 },
    rating: 4.68,
    reviewsCount: 36,
    images: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'wifi', 'ac', 'elevator', 'family'],
    description:
      'إطلالة مباشرة على البحر في ميامي قريبة من كافة الخدمات والمطاعم والشواطئ، سعر واضح بدون سماسرة.',
    rules: ['العائلات فقط', 'استلام الساعة ٢ عصراً'],
    owner: {
      name: 'أ. أيمن البحيري',
      phone: '01287766554',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٥ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'chalet-gouna-1',
    title: 'شاليه بوهيمي فاخر على المارينا في الجونة — البحر الأحمر',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'red-sea-sinai',
    governorate: 'red-sea-sinai',
    area: 'الجونة',
    destinationLabel: 'البحر الأحمر وسيناء',
    resort: 'الجونة - مارينا أبو تيج',
    unitType: 'chalet',
    viewType: 'lagoon',
    includesPasses: true,
    pricePerNight: 5900,
    weeklyPrice: 38000,
    monthlyPrice: 120000,
    weekendPricePerNight: 6500,
    peakPricePerNight: 7400,
    securityDeposit: 2000,
    downPaymentPercent: 30,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 120,
    maxGuests: 4,
    beachDistanceMeters: 200,
    coordinates: { lat: 27.4024, lng: 33.6819 },
    rating: 4.95,
    reviewsCount: 42,
    featured: true,
    dateRules: {
      '2026-11-20': {
        status: 'available',
        nightlyPrice: 6800,
        note: 'السعر شامل كارنيهات الشاطئ ودخول اللاجون',
      },
      '2026-11-21': {
        status: 'available',
        nightlyPrice: 6800,
        note: 'السعر شامل كارنيهات الشاطئ ودخول اللاجون',
      },
      '2026-11-22': {
        status: 'available',
        nightlyPrice: 5600,
        note: 'حد أدنى ليلتان • شامل استخدام الدراجات',
      },
      '2026-11-23': {
        status: 'available',
        nightlyPrice: 5600,
        note: 'حد أدنى ليلتان • شامل استخدام الدراجات',
      },
    },
    images: [
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['pool', 'ac', 'wifi', 'parking', 'sea-view'],
    nearbyHighlights: [
      { category: 'beach', name: 'شاطئ زيتونة بيتش', distance: '٥ دقائق بالتوك توك' },
      { category: 'market', name: 'بست واي ماركت - المارينا', distance: 'دقيقتان مشياً' },
      { category: 'dining', name: 'مارينا أبو تيج لليخوت', distance: 'خطوات' },
    ],
    description:
      'شاليه أنيق بديكور بوهيمي يطل على اليخوت واللاجون في قلب الجونة، مع دراجات هوائية مجانية وإنترنت فائق السرعة.',
    rules: ['مناسب للأزواج والعائلات الصغيرة', 'تسجيل دخول ذاتي عبر كود ذكي'],
    owner: {
      name: 'أ. سلمى واصف',
      phone: '01007778899',
      instaPayHandle: 'salma.gouna@instapay',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٠ دقائق',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'prop-hurghada-studio-1',
    title: 'استوديو مودرن في الممشى السياحي بالغردقة — شاطئ خاص وحمام سباحة',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'red-sea-sinai',
    governorate: 'red-sea-sinai',
    area: 'الغردقة',
    destinationLabel: 'البحر الأحمر وسيناء',
    resort: 'الغردقة - الممشى السياحي',
    unitType: 'studio',
    viewType: 'pool',
    includesPasses: true,
    pricePerNight: 1500,
    weeklyPrice: 9500,
    monthlyPrice: 24000,
    weekendPricePerNight: 1700,
    securityDeposit: 1000,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 58,
    maxGuests: 3,
    beachDistanceMeters: 220,
    coordinates: { lat: 27.1973, lng: 33.8358 },
    rating: 4.82,
    reviewsCount: 29,
    images: [
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['pool', 'wifi', 'ac', 'elevator'],
    description:
      'استوديو اقتصادي راقٍ في قلب الممشى السياحي بالغردقة، مثالي للإجازات الشتوية والصيفية والعمل عن بُعد.',
    rules: ['إيجار يومي أو شهري مباشر بدون وسطاء'],
    owner: {
      name: 'أ. مينا جورج',
      phone: '01277665544',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٥ دقيقة',
      memberSince: '٢٠٢٣',
    },
  },
  {
    id: 'chalet-matrouh-1',
    title: 'شاليه عائلي مطل على خليج عجيبة مباشرة — مرسى مطروح',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly'],
    destination: 'marsa-matrouh',
    governorate: 'marsa-matrouh',
    area: 'عجيبة',
    destinationLabel: 'مرسى مطروح',
    resort: 'شاطئ عجيبة والأبيض',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 2900,
    weeklyPrice: 18500,
    weekendPricePerNight: 3300,
    peakPricePerNight: 3900,
    securityDeposit: 1000,
    downPaymentPercent: 20,
    bedrooms: 3,
    bathrooms: 1,
    areaSqm: 130,
    maxGuests: 7,
    beachDistanceMeters: 50,
    coordinates: { lat: 31.4142, lng: 27.0086 },
    rating: 4.7,
    reviewsCount: 29,
    images: [
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'ac', 'wifi', 'family', 'parking'],
    description:
      'استمتع بمياه مطروح الفيروزية من شرفة الشاليه مباشرة. مساحة واسعة تناسب العائلات الكبيرة وقريب من كافة الخدمات.',
    rules: ['العائلات فقط', 'استلام المفاتيح من المالك بالقرية'],
    owner: {
      name: 'حاج محمود العيسوي',
      phone: '01223456789',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ساعة',
      memberSince: '٢٠٢٠',
    },
  },
  {
    id: 'prop-delta-mansoura-1',
    title: 'شقة مفروشة مكيفة بالمشاية السفلية — المنصورة مطلة على النيل',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'delta-upper',
    governorate: 'delta-upper',
    area: 'المنصورة',
    destinationLabel: 'الدلتا والصعيد',
    resort: 'المنصورة - المشاية السفلية',
    unitType: 'furnished-apartment',
    viewType: 'city-nile',
    includesPasses: true,
    pricePerNight: 1400,
    weeklyPrice: 8800,
    monthlyPrice: 22000,
    weekendPricePerNight: 1550,
    securityDeposit: 2000,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 150,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 31.0468, lng: 31.3676 },
    rating: 4.78,
    reviewsCount: 16,
    images: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family'],
    description:
      'شقة مفروشة نظيفة جداً بالمشاية السفلية قريبة من جامعة المنصورة ومراكز الكلى والطبية الكبرى، مثالية للعائلات والزائرين.',
    rules: ['العائلات والزيارات الطبية فقط', 'عقد إيجار واضح وشفاف'],
    owner: {
      name: 'د. محمد الشناوي',
      phone: '01019988776',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٠ دقيقة',
      memberSince: '٢٠٢٣',
    },
  },
  {
    id: 'prop-dahab-lagoon-1',
    title: 'شاليه خشبي مطل على شاطئ اللاجونا مباشرة — دهب',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'red-sea-sinai',
    governorate: 'red-sea-sinai',
    area: 'دهب',
    destinationLabel: 'البحر الأحمر وسيناء',
    resort: 'دهب - منطقة اللاجونا',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 2150,
    weeklyPrice: 13500,
    monthlyPrice: 38000,
    weekendPricePerNight: 2450,
    securityDeposit: 500,
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 95,
    maxGuests: 4,
    beachDistanceMeters: 30,
    coordinates: { lat: 28.4748, lng: 34.4998 },
    rating: 4.89,
    reviewsCount: 47,
    images: [
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'ac', 'wifi', 'garden'],
    description:
      'تجربة استجمام هادئة على خليج العقبة في دهب، إنترنت سريع للعمل عن بُعد وتراس خشبي يبعد خطوات عن البحر.',
    rules: ['مسموح بالعمل عن بعد والاستجمام الهادئ'],
    owner: {
      name: 'كابتن شريف سالم',
      phone: '01061122334',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٥ دقيقة',
      memberSince: '٢٠٢٠',
    },
  },
  {
    id: 'prop-sharm-naama-1',
    title: 'فيلا شاطئية بمسبح خاص قريبة من خليج نعمة — شرم الشيخ',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly'],
    destination: 'red-sea-sinai',
    governorate: 'red-sea-sinai',
    area: 'شرم الشيخ',
    destinationLabel: 'البحر الأحمر وسيناء',
    resort: 'شرم الشيخ - خليج نعمة',
    unitType: 'villa',
    viewType: 'pool',
    includesPasses: true,
    pricePerNight: 5400,
    weeklyPrice: 34000,
    weekendPricePerNight: 6100,
    securityDeposit: 3000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqm: 220,
    maxGuests: 7,
    beachDistanceMeters: 350,
    coordinates: { lat: 27.9158, lng: 34.3299 },
    rating: 4.86,
    reviewsCount: 22,
    images: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['pool', 'ac', 'wifi', 'family', 'garden', 'parking'],
    description:
      'فيلا عائلية خاصة في قلب خليج نعمة قريبة من الممشى والبحر مع حديقة وحمام سباحة خاص بالكامل.',
    rules: ['العائلات فقط', 'تأمين مسترد عند المغادرة'],
    owner: {
      name: 'م. تامر عبد الحميد',
      phone: '01009988771',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٠ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'prop-rassedr-1',
    title: 'شاليه صف أول بحر في قرية لا هاسيندا — رأس سدر',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly'],
    destination: 'red-sea-sinai',
    governorate: 'red-sea-sinai',
    area: 'رأس سدر',
    destinationLabel: 'البحر الأحمر وسيناء',
    resort: 'رأس سدر - لا هاسيندا',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 2250,
    weeklyPrice: 14000,
    weekendPricePerNight: 2650,
    securityDeposit: 1000,
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 105,
    maxGuests: 5,
    beachDistanceMeters: 60,
    coordinates: { lat: 29.5892, lng: 32.7073 },
    rating: 4.74,
    reviewsCount: 18,
    images: [
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'family', 'parking'],
    description:
      'شاليه عائلي مريح على بعد ساعتين من القاهرة في رأس سدر، مناسب لعطلات نهاية الأسبوع ورياضة الكايت سيرفينج.',
    rules: ['العائلات فقط', 'تصاريح القرية مشمولة'],
    owner: {
      name: 'أ. وائل الشاذلي',
      phone: '01155443322',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٣٠ دقيقة',
      memberSince: '٢٠٢٣',
    },
  },
  {
    id: 'prop-portsaid-1',
    title: 'شقة مفروشة مطلة على قناة السويس في بورفؤاد — بورسعيد',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'delta-upper',
    governorate: 'delta-upper',
    area: 'بورسعيد',
    destinationLabel: 'الدلتا والصعيد',
    resort: 'بورسعيد - فيلات بورفؤاد',
    unitType: 'furnished-apartment',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 1550,
    weeklyPrice: 9600,
    monthlyPrice: 24500,
    weekendPricePerNight: 1850,
    securityDeposit: 1500,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 145,
    maxGuests: 6,
    beachDistanceMeters: 250,
    coordinates: { lat: 31.2519, lng: 32.3177 },
    rating: 4.83,
    reviewsCount: 21,
    images: [
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'wifi', 'ac', 'elevator', 'family'],
    description:
      'شقة هادئة ومشرقة في حي الفيلات التاريخي ببورفؤاد على خطوات من المعدية والكورنيش.',
    rules: ['العائلات فقط', 'استلام رسمي مع المالك'],
    owner: {
      name: 'أ. سارة البورسعيدي',
      phone: '01204455667',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٥ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'prop-luxor-1',
    title: 'شقة نيلية مفروشة فاخرة بالبر الغربي مطلة على النيل — الأقصر',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'delta-upper',
    governorate: 'delta-upper',
    area: 'الأقصر',
    destinationLabel: 'الدلتا والصعيد',
    resort: 'الأقصر - كورنيش البر الغربي',
    unitType: 'furnished-apartment',
    viewType: 'city-nile',
    includesPasses: true,
    pricePerNight: 1350,
    weeklyPrice: 8200,
    monthlyPrice: 21000,
    weekendPricePerNight: 1500,
    securityDeposit: 1000,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 130,
    maxGuests: 5,
    beachDistanceMeters: 0,
    coordinates: { lat: 25.7023, lng: 32.6335 },
    rating: 4.91,
    reviewsCount: 25,
    images: [
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'family', 'garden'],
    description:
      'شقة مريحة بتراث صعيدي دافئ وإطلالة بانورامية على النيل ومناطيد الأقصر، مثالية للعائلات والسياحة الشتوية.',
    rules: ['الالتزام بالهدوء', 'سعر موحد للمصريين والزوار'],
    owner: {
      name: 'أ. محمود الطيبي',
      phone: '01092233441',
      verified: true,
      roleType: 'owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ٢٠ دقيقة',
      memberSince: '٢٠٢٢',
    },
  },
  {
    id: 'prop-aswan-1',
    title: 'شقة حديثة مكيفة على كورنيش النيل مباشرة — أسوان',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'delta-upper',
    governorate: 'delta-upper',
    area: 'أسوان',
    destinationLabel: 'الدلتا والصعيد',
    resort: 'أسوان - كورنيش النيل',
    unitType: 'furnished-apartment',
    viewType: 'city-nile',
    includesPasses: true,
    pricePerNight: 1600,
    weeklyPrice: 9800,
    monthlyPrice: 25000,
    weekendPricePerNight: 1750,
    securityDeposit: 1500,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 145,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 24.0908, lng: 32.8998 },
    rating: 4.88,
    reviewsCount: 19,
    images: [
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family'],
    description:
      'إطلالة ساحرة على النيل وجزيرة النباتات في قلب مدينة أسوان قريبة من المراسي والمطاعم والمحطة.',
    rules: ['العائلات والوفود', 'حجز مباشر بدون عمولة'],
    owner: {
      name: 'م. ياسر النوبي',
      phone: '01122334455',
      verified: true,
      roleType: 'founding-owner',
      verificationStatus: 'verified',
      responseTime: 'يرد خلال ١٥ دقيقة',
      memberSince: '٢٠٢١',
    },
  },
];

export const MARKET_BENCHMARKS: MarketBenchmarkEntry[] = [
  {
    id: 'bench-tagamoa',
    areaName: 'التجمع الخامس',
    governorateLabel: 'القاهرة الكبرى',
    category: 'residential',
    dailyWeekdayAvg: 2250,
    dailyWeekendAvg: 2650,
    monthlyAvg: 42000,
    demandLevel: 'مرتفع جداً',
    tip: 'الإيجار الشهري يوفر حتى ٣٨٪ مقارنة بالسعر اليومي عند الحجز لأكثر من ٢٠ يوماً.',
  },
  {
    id: 'bench-nasr',
    areaName: 'مدينة نصر',
    governorateLabel: 'القاهرة الكبرى',
    category: 'residential',
    dailyWeekdayAvg: 1750,
    dailyWeekendAvg: 2050,
    monthlyAvg: 30000,
    demandLevel: 'مرتفع جداً',
    tip: 'تجنب الوسطاء غير المعتمدين في شقق عباس العقاد ومكرم عبيد بطلب عقد المالك الأصلي.',
  },
  {
    id: 'bench-mohandessin',
    areaName: 'المهندسين والدقي',
    governorateLabel: 'القاهرة الكبرى',
    category: 'residential',
    dailyWeekdayAvg: 2400,
    dailyWeekendAvg: 2750,
    monthlyAvg: 45000,
    demandLevel: 'مرتفع',
    tip: 'الشقق المجهزة بأسانسير وواي فاي فايبر تحظى بأعلى إقبال للشركات والوافدين.',
  },
  {
    id: 'bench-haram',
    areaName: 'الهرم وحدائق أكتوبر',
    governorateLabel: 'القاهرة الكبرى',
    category: 'residential',
    dailyWeekdayAvg: 1250,
    dailyWeekendAvg: 1500,
    monthlyAvg: 19000,
    demandLevel: 'متوازن',
    tip: 'خيار اقتصادي ممتاز للعائلات القريبة من المتحف المصري الكبير وطريق الواحات.',
  },
  {
    id: 'bench-alex',
    areaName: 'الإسكندرية (كفر عبده وميامي)',
    governorateLabel: 'الإسكندرية',
    category: 'residential',
    dailyWeekdayAvg: 1850,
    dailyWeekendAvg: 2250,
    monthlyAvg: 29500,
    demandLevel: 'مرتفع',
    tip: 'شتاء الإسكندرية يقدم خصومات تصل إلى ٣٠٪ على الإيجارات الشهرية مقارنة بذروة الصيف.',
  },
  {
    id: 'bench-sokhna',
    areaName: 'العين السخنة',
    governorateLabel: 'العين السخنة',
    category: 'coastal',
    dailyWeekdayAvg: 3400,
    dailyWeekendAvg: 4300,
    monthlyAvg: 55000,
    demandLevel: 'مرتفع جداً',
    tip: 'الأحد حتى الأربعاء أرخص بـ ٢٢٪ في المتوسط من ليالي الخميس والجمعة بالسخنة.',
  },
  {
    id: 'bench-north-coast',
    areaName: 'الساحل الشمالي (سيدي عبد الرحمن والعلمين)',
    governorateLabel: 'الساحل الشمالي',
    category: 'coastal',
    dailyWeekdayAvg: 7200,
    dailyWeekendAvg: 8800,
    monthlyAvg: 135000,
    demandLevel: 'مرتفع جداً',
    tip: 'احرص على وجود بند واضح يشمل تصاريح الدخول والكارنيهات لتفادي رسوم إضافية عند البوابة.',
  },
  {
    id: 'bench-hurghada',
    areaName: 'الغردقة والجونة',
    governorateLabel: 'البحر الأحمر',
    category: 'coastal',
    dailyWeekdayAvg: 2900,
    dailyWeekendAvg: 3400,
    monthlyAvg: 48000,
    demandLevel: 'مرتفع',
    tip: 'أكتوبر حتى أبريل هو موسم الذروة السياحية في البحر الأحمر؛ الحجز المبكر يثبت السعر.',
  },
];

export const INITIAL_RENTER_TRUST_REVIEWS: RenterTrustReview[] = [
  {
    id: 'trust-seed-1',
    renterName: 'أحمد محمود',
    renterPhone: '01012345678',
    hostName: 'م. طارق المنشاوي',
    bookingId: 'seed-booking-1',
    chaletTitle: 'شاليه صف أول بحر في مراسي',
    rating: 5,
    punctualityScore: 5,
    propertyCareScore: 5,
    tags: ['الالتزام بالمواعيد', 'المحافظة على الوحدة'],
    comment: 'مستأجر محترم جداً، التزم بموعد الاستلام والتسليم وسلم الشاليه في حالة ممتازة.',
    createdAt: '2026-08-14T12:00:00.000Z',
  },
  {
    id: 'trust-seed-2',
    renterName: 'أحمد محمود',
    renterPhone: '01012345678',
    hostName: 'م. شريف عبد الرحمن',
    bookingId: 'seed-booking-2',
    chaletTitle: 'شقة مفروشة بالتجمع الخامس',
    rating: 4.8,
    punctualityScore: 5,
    propertyCareScore: 4.6,
    tags: ['الالتزام بالمواعيد', 'المحافظة على الوحدة'],
    comment: 'تواصل راقٍ وشفافية كاملة في الاتفاق وهدوء تام طوال فترة الإقامة.',
    createdAt: '2026-09-20T15:30:00.000Z',
  },
];

export const INITIAL_BOOKINGS: BookingRequest[] = [
  {
    id: 'seed-booking-confirmed-nov',
    chaletId: 'prop-cairo-tagamoa-1',
    chaletTitle: 'شقة مفروشة الترا سوبر لوكس بالتجمع الخامس قرب الجامعة الأمريكية',
    resort: 'التجمع الخامس - اللوتس',
    destinationLabel: 'القاهرة الكبرى',
    ownerName: 'م. شريف عبد الرحمن',
    ownerPhone: '01001122334',
    ownerInstaPay: 'sherif.owner@instapay',
    guestName: 'د. كريم المنشاوي',
    guestPhone: '01012345678',
    checkIn: '2026-11-10',
    checkOut: '2026-11-15',
    nights: 5,
    rentalDuration: 'daily',
    inquiryChannel: 'form',
    guests: 4,
    totalPrice: 12500,
    depositAmount: 2500,
    remainingAmount: 10000,
    securityDeposit: 5000,
    policyAccepted: true,
    notes: 'إقامة عمل عائلية — تم تحويل جدية الحجز عبر إنستاباي',
    status: 'confirmed',
    confirmedAt: '2026-11-02T14:20:00.000Z',
    createdAt: '2026-11-01T10:15:00.000Z',
  },
  {
    id: 'seed-booking-confirmed-oct',
    chaletId: 'chalet-gouna-1',
    chaletTitle: 'شاليه بوهيمي فاخر على المارينا في الجونة — البحر الأحمر',
    resort: 'الجونة - مارينا أبو تيج',
    destinationLabel: 'البحر الأحمر وسيناء',
    ownerName: 'أ. سلمى واصف',
    ownerPhone: '01007778899',
    ownerInstaPay: 'salma.gouna@instapay',
    guestName: 'أ. نورهان عادل',
    guestPhone: '01122334455',
    checkIn: '2026-10-15',
    checkOut: '2026-10-19',
    nights: 4,
    rentalDuration: 'daily',
    inquiryChannel: 'form',
    guests: 3,
    totalPrice: 24800,
    depositAmount: 7440,
    remainingAmount: 17360,
    securityDeposit: 2000,
    policyAccepted: true,
    notes: 'حجز مؤكد شامل كارنيهات الشاطئ',
    status: 'confirmed',
    confirmedAt: '2026-10-01T09:10:00.000Z',
    createdAt: '2026-09-30T18:00:00.000Z',
  },
  {
    id: 'seed-booking-pending-nov',
    chaletId: 'prop-cairo-nasrcity-1',
    chaletTitle: 'شقة مفروشة راقية بشارع عباس العقاد مباشرة — أسانسير وواي فاي',
    resort: 'مدينة نصر - عباس العقاد',
    destinationLabel: 'القاهرة الكبرى',
    ownerName: 'أ. هبة مصطفى',
    ownerPhone: '01112233445',
    ownerInstaPay: 'heba.mostafa@instapay',
    guestName: 'م. عمر الشهابي',
    guestPhone: '01098765432',
    checkIn: '2026-11-28',
    checkOut: '2026-12-02',
    nights: 4,
    rentalDuration: 'daily',
    inquiryChannel: 'form',
    guests: 4,
    totalPrice: 7400,
    depositAmount: 1480,
    remainingAmount: 5920,
    securityDeposit: 3000,
    policyAccepted: true,
    notes: 'بانتظار مراجعة تحويل إنستاباي لجدية الحجز',
    status: 'pending',
    createdAt: '2026-11-16T16:40:00.000Z',
  },
];

export function formatEGP(amount: number): string {
  return `${amount.toLocaleString('ar-EG')} ج.م`;
}

export function getAmenityLabel(id: AmenityId): string {
  return AMENITIES.find((a) => a.id === id)?.label ?? id;
}

export function getUnitTypeLabel(id: UnitType): string {
  switch (id) {
    case 'furnished-apartment':
      return 'شقة مفروشة';
    case 'studio':
      return 'استوديو';
    case 'chalet':
    case 'ground-garden':
      return 'شاليه';
    case 'villa':
      return 'فيلا / توين هاوس';
    case 'duplex':
    case 'penthouse':
      return 'دوبلكس';
    default:
      return id;
  }
}

export function getViewTypeLabel(id: ViewType): string {
  return VIEW_TYPES.find((v) => v.id === id)?.label ?? id;
}

export function getAdvertiserBadgeInfo(role?: AdvertiserRole, brokerAgency?: string): {
  label: string;
  sublabel: string;
  variant: 'founding' | 'owner' | 'broker';
} {
  if (role === 'broker') {
    return {
      label: 'وسيط معتمد (بروكر)',
      sublabel: brokerAgency?.trim() || 'مكتب وساطة معتمد',
      variant: 'broker',
    };
  }
  if (role === 'founding-owner') {
    return {
      label: 'مالك مؤسس',
      sublabel: 'بدون عمولة نهائياً',
      variant: 'founding',
    };
  }
  return {
    label: 'مالك أصلي موثق',
    sublabel: 'بدون عمولة نهائياً',
    variant: 'owner',
  };
}

export function getRentalPriceForDuration(
  chalet: Chalet,
  duration: RentalDuration
): { price: number; unitLabel: string } {
  if (duration === 'monthly') {
    const monthly = chalet.monthlyPrice ?? Math.round(chalet.pricePerNight * 22);
    return { price: monthly, unitLabel: 'شهرياً' };
  }
  if (duration === 'weekly') {
    const weekly = chalet.weeklyPrice ?? Math.round(chalet.pricePerNight * 6.2);
    return { price: weekly, unitLabel: 'أسبوعياً' };
  }
  return { price: chalet.pricePerNight, unitLabel: 'يومياً' };
}

export function resolveGovernorateId(chalet: Chalet): Exclude<GovernorateId, 'all'> {
  if (chalet.governorate) return chalet.governorate;
  if (chalet.destination === 'el-gouna' || chalet.destination === 'dahab') {
    return 'red-sea-sinai';
  }
  return chalet.destination as Exclude<GovernorateId, 'all'>;
}

export interface MarketPriceComparison {
  benchmarkArea: string;
  benchmarkAvg: number;
  unitPrice: number;
  diffPercent: number;
  status: 'below' | 'fair' | 'above';
  label: string;
}

export function compareToMarketBenchmark(
  chalet: Chalet,
  duration: RentalDuration = 'daily'
): MarketPriceComparison | null {
  const haystack = `${chalet.area ?? ''} ${chalet.resort} ${chalet.destinationLabel}`;

  const match =
    MARKET_BENCHMARKS.find((b) => {
      const areaToken = b.areaName.split(' ')[0];
      return haystack.includes(areaToken) || haystack.includes(b.governorateLabel);
    }) ??
    MARKET_BENCHMARKS.find((b) => {
      if (resolveGovernorateId(chalet) === 'greater-cairo') return b.id === 'bench-tagamoa';
      if (resolveGovernorateId(chalet) === 'alexandria') return b.id === 'bench-alex';
      if (resolveGovernorateId(chalet) === 'ain-sokhna') return b.id === 'bench-sokhna';
      if (resolveGovernorateId(chalet) === 'north-coast') return b.id === 'bench-north-coast';
      if (resolveGovernorateId(chalet) === 'red-sea-sinai') return b.id === 'bench-hurghada';
      return false;
    });

  if (!match) return null;

  let benchmarkAvg = match.dailyWeekdayAvg;
  let unitPrice = chalet.pricePerNight;

  if (duration === 'monthly') {
    unitPrice = chalet.monthlyPrice ?? Math.round(chalet.pricePerNight * 22);
    benchmarkAvg = match.monthlyAvg;
  } else if (duration === 'weekly') {
    unitPrice = Math.round((chalet.weeklyPrice ?? chalet.pricePerNight * 6.2) / 7);
    benchmarkAvg = match.dailyWeekdayAvg;
  }

  if (benchmarkAvg <= 0) return null;

  const rawDiff = Math.round(((unitPrice - benchmarkAvg) / benchmarkAvg) * 100);
  if (rawDiff <= -5) {
    return {
      benchmarkArea: match.areaName,
      benchmarkAvg,
      unitPrice,
      diffPercent: Math.abs(rawDiff),
      status: 'below',
      label: `أقل من متوسط السوق بـ ${Math.abs(rawDiff).toLocaleString('ar-EG')}٪`,
    };
  }
  if (rawDiff >= 8) {
    return {
      benchmarkArea: match.areaName,
      benchmarkAvg,
      unitPrice,
      diffPercent: rawDiff,
      status: 'above',
      label: `أعلى من متوسط السوق بـ ${rawDiff.toLocaleString('ar-EG')}٪`,
    };
  }
  return {
    benchmarkArea: match.areaName,
    benchmarkAvg,
    unitPrice,
    diffPercent: Math.abs(rawDiff),
    status: 'fair',
    label: 'سعر مطابق لمؤشر السوق',
  };
}
