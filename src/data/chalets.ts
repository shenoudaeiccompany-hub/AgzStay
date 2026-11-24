import type {
  AdvertiserRoleLabel,
  AmenityId,
  Chalet,
  PropertyType,
} from '@/types/chalet';

export const PROPERTY_TYPES: readonly (PropertyType | 'الكل')[] = [
  'الكل',
  'شقة مفروشة',
  'شقة فاضية',
  'شاليه',
  'فيلا',
  'استوديو',
];

export const EDITABLE_PROPERTY_TYPES: readonly PropertyType[] = [
  'شقة مفروشة',
  'شقة فاضية',
  'شاليه',
  'فيلا',
  'استوديو',
];

export const ADVERTISER_ROLES: readonly (AdvertiserRoleLabel | 'الكل')[] = [
  'الكل',
  'مالك مباشر',
  'مكتب / وسيط',
];

export const EDITABLE_ADVERTISER_ROLES: readonly AdvertiserRoleLabel[] = [
  'مالك مباشر',
  'مكتب / وسيط',
];

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

export function getAmenityLabel(id: AmenityId): string {
  return AMENITIES.find((a) => a.id === id)?.label ?? id;
}

export function formatEGP(amount: number): string {
  return `${Math.round(amount).toLocaleString('ar-EG')} ج.م`;
}

export function isMonthlyOnlyProperty(property: Pick<Chalet, 'propertyType'>): boolean {
  return property.propertyType === 'شقة فاضية';
}

export function getPriceUnitLabel(property: Pick<Chalet, 'propertyType'>): string {
  return isMonthlyOnlyProperty(property) ? 'إيجار شهري' : 'سعر الليلة';
}

export function getShortPriceUnitLabel(property: Pick<Chalet, 'propertyType'>): string {
  return isMonthlyOnlyProperty(property) ? 'شهرياً' : 'لليلة';
}

function offsetIsoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const THREE_REAL_EGYPT_SAMPLE_UNITS: Omit<Chalet, 'id'>[] = [
  {
    title: 'شاليه صف أول لاجون وبحر في مراسي سيدي عبد الرحمن — الساحل الشمالي',
    description:
      'شاليه فاخر بتشطيب فندقي هادئ في قلب مراسي الساحل الشمالي، يضم ٣ غرف نوم مكيفة وتراس واسع يطل على اللاجون، مع مطبخ متكامل وقرب خطوات من الشاطئ.',
    governorate: 'مطروح',
    city: 'الساحل الشمالي - العلمين وسيدي عبد الرحمن',
    areaOrVillage: 'مراسي',
    propertyType: 'شاليه',
    advertiserRole: 'مالك مباشر',
    ownerName: 'م. طارق المنشاوي',
    ownerPhone: '01012345678',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 7500,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 145,
    maxGuests: 6,
    beachDistanceMeters: 90,
    coordinates: { lat: 30.9672, lng: 28.7423 },
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'wifi', 'family', 'parking'],
    blockedDates: [offsetIsoDate(4), offsetIsoDate(5)],
    rules: ['العائلات فقط', 'استلام المفاتيح ٢ عصراً والمغادرة ١٢ ظهراً'],
    availabilityStatus: 'active',
  },
  {
    title: 'شاليه بحديقة خاصة وإطلالة بانوراما في المونت جلالة — العين السخنة',
    description:
      'شاليه أرضي هادئ بحديقة خاصة في المونت جلالة العين السخنة على بُعد ساعة ونصف من القاهرة، مثالي لعطلات نهاية الأسبوع والعائلات.',
    governorate: 'السويس',
    city: 'العين السخنة',
    areaOrVillage: 'المونت جلالة',
    propertyType: 'شاليه',
    advertiserRole: 'مالك مباشر',
    ownerName: 'أ. نادية الشريف',
    ownerPhone: '01098765432',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 3900,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 115,
    maxGuests: 5,
    beachDistanceMeters: 150,
    coordinates: { lat: 29.5206, lng: 32.3694 },
    images: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'garden', 'family', 'parking'],
    blockedDates: [offsetIsoDate(7), offsetIsoDate(8)],
    rules: ['الهدوء بعد منتصف الليل', 'تأمين مسترد عند المعاينة والاستلام'],
    availabilityStatus: 'active',
  },
  {
    title: 'استوديو فندقي بالممشى السياحي وقريب من البحر — الغردقة',
    description:
      'استوديو مشرق ونظيف في قلب الممشى السياحي بالغردقة مع حمام سباحة مشترك، واي فاي سريع، وتكييف بالكامل، مناسب للإجازات أو العمل عن بُعد.',
    governorate: 'البحر الأحمر',
    city: 'الغردقة',
    areaOrVillage: 'الممشى السياحي',
    propertyType: 'استوديو',
    advertiserRole: 'مالك مباشر',
    ownerName: 'أ. مينا جورج',
    ownerPhone: '01223344556',
    isFeatured: false,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 1650,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 60,
    maxGuests: 3,
    beachDistanceMeters: 200,
    coordinates: { lat: 27.1973, lng: 33.8358 },
    images: [
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['pool', 'wifi', 'ac', 'elevator'],
    blockedDates: [],
    rules: ['الاتفاق والمعاينة مباشرة عند الاستلام'],
    availabilityStatus: 'active',
  },
];

export const INITIAL_CHALETS: Chalet[] = [
  {
    id: 'demo-marassi-1',
    isDemo: true,
    ...THREE_REAL_EGYPT_SAMPLE_UNITS[0],
  },
  {
    id: 'demo-sokhna-1',
    isDemo: true,
    ...THREE_REAL_EGYPT_SAMPLE_UNITS[1],
  },
  {
    id: 'demo-hurghada-1',
    isDemo: true,
    ...THREE_REAL_EGYPT_SAMPLE_UNITS[2],
  },
  {
    id: 'demo-cairo-tagamoa-1',
    isDemo: true,
    title: 'شقة مفروشة مودرن بالتجمع الخامس قرب الجامعة الأمريكية',
    description:
      'شقة مفروشة بالكامل بأثاث عصري في كمبوند هادئ بالتجمع الخامس، مكيفة بالكامل مع إنترنت فايبر ومصعد وموقف سيارة خاص.',
    governorate: 'القاهرة',
    city: 'القاهرة الجديدة',
    areaOrVillage: 'التجمع الخامس',
    propertyType: 'شقة مفروشة',
    advertiserRole: 'مالك مباشر',
    ownerName: 'م. شريف عبد الرحمن',
    ownerPhone: '01001122334',
    isFeatured: true,
    depositType: 'fixed',
    depositValue: 2000,
    pricePerNight: 2400,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 175,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0258, lng: 31.4913 },
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family', 'parking'],
    blockedDates: [],
    rules: ['مناسبة للعائلات والوافدين', 'تأمين مسترد عند تسليم المفاتيح'],
    availabilityStatus: 'active',
  },
  {
    id: 'demo-zayed-unfurnished-1',
    isDemo: true,
    title: 'شقة فاضية تشطيب الترا سوبر لوكس للإيجار الشهري في الشيخ زايد',
    description:
      'شقة فاضية غير مفروشة في كمبوند راقٍ بالشيخ زايد جاهزة للسكن العائلي الفوري، مطبخ راكب وتكييفات مركزية ومساحات خضراء واسعة.',
    governorate: 'الجيزة',
    city: 'الشيخ زايد',
    areaOrVillage: 'بيفرلي هيلز',
    propertyType: 'شقة فاضية',
    advertiserRole: 'مكتب / وسيط',
    ownerName: 'مكتب زايد العقاري',
    ownerPhone: '01112223344',
    isFeatured: false,
    depositType: 'fixed',
    depositValue: 18000,
    pricePerNight: 18000,
    monthlyPrice: 18000,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 190,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0229, lng: 30.9803 },
    images: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['elevator', 'garden', 'parking', 'family'],
    blockedDates: [],
    rules: ['عقد إيجار شهري أو سنوي', 'المعاينة متاحة يومياً بعد التنسيق'],
    availabilityStatus: 'active',
  },
  {
    id: 'demo-sharm-villa-1',
    isDemo: true,
    title: 'فيلا شاطئية بمسبح خاص قريبة من خليج نعمة — شرم الشيخ',
    description:
      'فيلا عائلية مستقلة في خليج نعمة مع حمام سباحة خاص وحديقة وتراس خارجي هادئ على بُعد دقائق من الممشى والشاطئ.',
    governorate: 'جنوب سيناء',
    city: 'شرم الشيخ',
    areaOrVillage: 'خليج نعمة',
    propertyType: 'فيلا',
    advertiserRole: 'مالك مباشر',
    ownerName: 'م. تامر عبد الحميد',
    ownerPhone: '01055667788',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 25,
    pricePerNight: 5600,
    bedrooms: 4,
    bathrooms: 3,
    areaSqm: 240,
    maxGuests: 8,
    beachDistanceMeters: 300,
    coordinates: { lat: 27.9158, lng: 34.3299 },
    images: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1000&q=80',
    ],
    amenities: ['pool', 'ac', 'wifi', 'family', 'garden', 'parking'],
    blockedDates: [],
    rules: ['العائلات فقط', 'ممنوع إقامة الحفلات الصاخبة'],
    availabilityStatus: 'active',
  },
];
