import type { TFunction } from "i18next";

import type { Taxonomy, TaxonomyCategory } from "@/lib/types";

const NON_TRANSLATED_CATEGORY_TERMS = new Set([
  "ADR",
  "GDR",
  "FUTURES",
  "ETF",
  "ETN",
  "CFD",
  "DEFI",
  "NFTS",
  "STABLECOINS",
]);

function localizeRegionCountryName(categoryKey: string, fallbackName: string): string {
  if (!categoryKey.startsWith("country_")) return fallbackName;
  const regionCode = categoryKey.slice("country_".length).toUpperCase();
  if (!regionCode) return fallbackName;
  try {
    const display = new Intl.DisplayNames(undefined, { type: "region" });
    return display.of(regionCode) ?? fallbackName;
  } catch {
    return fallbackName;
  }
}

const REGION_KEY_BY_NAME: Record<string, string> = {
  Europe: "taxonomy.system.regions.category.EUROPE.name",
  Americas: "taxonomy.system.regions.category.AMERICAS.name",
  Asia: "taxonomy.system.regions.category.ASIA.name",
  Africa: "taxonomy.system.regions.category.AFRICA.name",
  Oceania: "taxonomy.system.regions.category.OCEANIA.name",
  "Northern Europe": "taxonomy.system.regions.category.NORTHERN_EUROPE.name",
  "Western Europe": "taxonomy.system.regions.category.WESTERN_EUROPE.name",
  "Eastern Europe": "taxonomy.system.regions.category.EASTERN_EUROPE.name",
  "Southern Europe": "taxonomy.system.regions.category.SOUTHERN_EUROPE.name",
  "Northern America": "taxonomy.system.regions.category.NORTHERN_AMERICA.name",
  "Central America": "taxonomy.system.regions.category.CENTRAL_AMERICA.name",
  Caribbean: "taxonomy.system.regions.category.CARIBBEAN.name",
  "South America": "taxonomy.system.regions.category.SOUTH_AMERICA.name",
  "Western Asia": "taxonomy.system.regions.category.WESTERN_ASIA.name",
  "Central Asia": "taxonomy.system.regions.category.CENTRAL_ASIA.name",
  "Eastern Asia": "taxonomy.system.regions.category.EASTERN_ASIA.name",
  "Southern Asia": "taxonomy.system.regions.category.SOUTHERN_ASIA.name",
  "South-eastern Asia": "taxonomy.system.regions.category.SOUTHEASTERN_ASIA.name",
  "Northern Africa": "taxonomy.system.regions.category.NORTHERN_AFRICA.name",
  "Western Africa": "taxonomy.system.regions.category.WESTERN_AFRICA.name",
  "Eastern Africa": "taxonomy.system.regions.category.EASTERN_AFRICA.name",
  "Middle Africa": "taxonomy.system.regions.category.MIDDLE_AFRICA.name",
  "Southern Africa": "taxonomy.system.regions.category.SOUTHERN_AFRICA.name",
  "Australia and New Zealand": "taxonomy.system.regions.category.AUSTRALIA_NEW_ZEALAND.name",
  Melanesia: "taxonomy.system.regions.category.MELANESIA.name",
  Micronesia: "taxonomy.system.regions.category.MICRONESIA.name",
  Polynesia: "taxonomy.system.regions.category.POLYNESIA.name",
};

const INDUSTRY_SECTOR_KEY_BY_NAME: Record<string, string> = {
  "Communication Services": "taxonomy.system.industries_gics.category.COMMUNICATION_SERVICES.name",
  "Consumer Discretionary": "taxonomy.system.industries_gics.category.CONSUMER_DISCRETIONARY.name",
  "Consumer Staples": "taxonomy.system.industries_gics.category.CONSUMER_STAPLES.name",
  Energy: "taxonomy.system.industries_gics.category.ENERGY.name",
  Financials: "taxonomy.system.industries_gics.category.FINANCIALS.name",
  "Health Care": "taxonomy.system.industries_gics.category.HEALTH_CARE.name",
  Industrials: "taxonomy.system.industries_gics.category.INDUSTRIALS.name",
  "Information Technology": "taxonomy.system.industries_gics.category.INFORMATION_TECHNOLOGY.name",
  Materials: "taxonomy.system.industries_gics.category.MATERIALS.name",
  "Real Estate": "taxonomy.system.industries_gics.category.REAL_ESTATE.name",
  Utilities: "taxonomy.system.industries_gics.category.UTILITIES.name",
};

const INDUSTRY_TERM_REPLACEMENTS: Array<[string, string]> = [
  ["Oil, Gas & Consumable Fuels", "Öl, Gas und Brennstoffe"],
  ["Integrated Oil & Gas", "Integrierte Öl- und Gasunternehmen"],
  ["Oil & Gas Drilling", "Öl- und Gasbohrungen"],
  ["Oil & Gas Equipment & Services", "Öl- und Gasausrüstung und -dienstleistungen"],
  ["Oil & Gas Exploration & Production", "Öl- und Gasexploration und -förderung"],
  ["Oil & Gas Refining & Marketing", "Öl- und Gasraffination und -vermarktung"],
  ["Oil & Gas Storage & Transportation", "Öl- und Gasspeicherung und -transport"],
  ["Coal & Consumable Fuels", "Kohle und Brennstoffe"],
  ["Energy Equipment & Services", "Energieausrüstung und -dienstleistungen"],
  ["Construction Machinery & Heavy Trucks", "Baumaschinen und Schwerlastfahrzeuge"],
  ["Agricultural & Farm Machinery", "Land- und Agrarmaschinen"],
  ["Human Resource & Employment Services", "Personal- und Beschäftigungsdienstleistungen"],
  ["Research & Consulting Services", "Forschungs- und Beratungsdienstleistungen"],
  ["Data Processing & Outsourced Services", "Datenverarbeitung und ausgelagerte Dienstleistungen"],
  ["Highways & Railtracks", "Autobahnen und Schienenwege"],
  ["Marine Ports & Services", "Seehäfen und -dienstleistungen"],
  ["Automobiles & Components", "Automobile und Komponenten"],
  ["Auto Parts & Equipment", "Autoersatzteile und -ausrüstung"],
  ["Tires & Rubber", "Reifen und Gummi"],
  ["Automobile Manufacturers", "Automobilhersteller"],
  ["Motorcycle Manufacturers", "Motorradhersteller"],
  ["Textiles, Apparel & Luxury Goods", "Textilien, Bekleidung und Luxusgüter"],
  ["Apparel, Accessories & Luxury Goods", "Bekleidung, Accessoires und Luxusgüter"],
  ["Hotels, Resorts & Cruise Lines", "Hotels, Resorts und Kreuzfahrtlinien"],
  ["Computer & Electronics Retail", "Computer- und Elektronikeinzelhandel"],
  ["Consumer Staples Merchandise Retail", "Einzelhandel mit Basiskonsumgütern"],
  ["Distillers & Vintners", "Destillerien und Winzer"],
  ["Packaged Foods & Meats", "Verpackte Lebensmittel und Fleischprodukte"],
  ["Commercial & Residential Mortgage Finance", "Gewerbliche und private Hypothekenfinanzierung"],
  ["Multi-Sector Holdings", "Mehrsektor-Holdings"],
  ["Internet Software & Services", "Internetsoftware und -dienstleistungen"],
  ["IT Consulting & Other Services", "IT-Beratung und sonstige Dienstleistungen"],
  ["Application Software", "Anwendungssoftware"],
  ["Systems Software", "Systemsoftware"],
  ["Technology Hardware, Storage & Peripherals", "Technologie-Hardware, Speicher und Peripherie"],
  ["Electronic Equipment & Instruments", "Elektronische Ausrüstung und Instrumente"],
  ["Electronic Manufacturing Services", "Elektronikfertigungsdienstleistungen"],
  ["Alternative Carriers", "Alternative Netzbetreiber"],
  ["Cable & Satellite", "Kabel und Satellit"],
  ["Movies & Entertainment", "Filme und Unterhaltung"],
  ["Interactive Home Entertainment", "Interaktive Heimunterhaltung"],
  ["Interactive Media & Services", "Interaktive Medien und Dienste"],
  ["Independent Power Producers & Energy Traders", "Unabhängige Stromerzeuger und Energiehändler"],
  ["Independent Power and Renewable Electricity Producers", "Unabhängige Strom- und Erneuerbare-Erzeuger"],
  ["Diversified Real Estate Activities", "Diversifizierte Immobilienaktivitäten"],
  ["Other Specialized REITs", "Andere spezialisierte REITs"],
  ["Housewares & Specialties", "Haushaltswaren und Spezialartikel"],
  ["Commodity Chemicals", "Rohstoffchemikalien"],
  ["Diversified Chemicals", "Diversifizierte Chemieunternehmen"],
  ["Fertilizers & Agricultural Chemicals", "Düngemittel und Agrarchemikalien"],
  ["Industrial Gases", "Industriegase"],
  ["Specialty Chemicals", "Spezialchemikalien"],
  ["Metal & Glass Containers", "Metall- und Glasbehälter"],
  ["Precious Metals & Minerals", "Edelmetalle und Mineralien"],
  ["Communications Equipment", "Kommunikationsausrüstung"],
  ["Mortgage REITs", "Hypotheken-REITs"],
  ["Equity Real Estate Investment Trusts (REITs)", "Aktien-REITs"],
  ["Mortgage Real Estate Investment Trusts (REITs)", "Hypotheken-REITs"],
  ["Hotels, Restaurants & Leisure", "Hotels, Restaurants und Freizeit"],
  ["Food, Beverage & Tobacco", "Lebensmittel, Getränke und Tabak"],
  ["Pharmaceuticals, Biotechnology & Life Sciences", "Pharma, Biotechnologie und Lebenswissenschaften"],
  ["Semiconductors & Semiconductor Equipment", "Halbleiter und Halbleiterausrüstung"],
  ["Technology Hardware & Equipment", "Technologie-Hardware und -ausrüstung"],
  ["Electronic Equipment, Instruments & Components", "Elektronische Ausrüstung, Instrumente und Komponenten"],
  ["Oil & Gas", "Öl und Gas"],
  ["Health Care", "Gesundheitswesen"],
  ["Information Technology", "Informationstechnologie"],
  ["Communication Services", "Kommunikationsdienste"],
  ["Consumer Discretionary", "Zyklischer Konsum"],
  ["Consumer Staples", "Nichtzyklischer Konsum"],
  ["Real Estate", "Immobilien"],
  ["Capital Goods", "Investitionsgüter"],
  ["Commercial & Professional Services", "Kommerzielle und professionelle Dienstleistungen"],
  ["Commercial Services & Supplies", "Kommerzielle Dienstleistungen und Ausrüstung"],
  ["Professional Services", "Professionelle Dienstleistungen"],
  ["Transportation Infrastructure", "Transportinfrastruktur"],
  ["Air Freight & Logistics", "Luftfracht und Logistik"],
  ["Road & Rail", "Straße und Schiene"],
  ["Passenger Ground Transportation", "Personennahverkehr am Boden"],
  ["Cargo Ground Transportation", "Gütertransport am Boden"],
  ["Consumer Durables & Apparel", "Langlebige Konsumgüter und Bekleidung"],
  ["Consumer Services", "Verbraucherdienstleistungen"],
  ["Broadline Retail", "Breit aufgestellter Einzelhandel"],
  ["Specialty Retail", "Facheinzelhandel"],
  ["Consumer Staples Distribution & Retail", "Distribution und Einzelhandel Basiskonsum"],
  ["Food, Beverage & Tobacco", "Lebensmittel, Getränke und Tabak"],
  ["Household & Personal Products", "Haushalts- und Körperpflegeprodukte"],
  ["Health Care Equipment & Services", "Medizintechnik und Gesundheitsdienstleistungen"],
  ["Health Care Equipment & Supplies", "Medizintechnik und Verbrauchsmaterialien"],
  ["Health Care Providers & Services", "Gesundheitsanbieter und -dienstleistungen"],
  ["Pharmaceuticals, Biotechnology & Life Sciences", "Pharma, Biotechnologie und Lebenswissenschaften"],
  ["Diversified Financial Services", "Diversifizierte Finanzdienstleistungen"],
  ["Transaction & Payment Processing Services", "Transaktions- und Zahlungsabwicklungsdienste"],
  ["Asset Management & Custody Banks", "Vermögensverwaltung und Verwahrbanken"],
  ["Investment Banking & Brokerage", "Investmentbanking und Brokerage"],
  ["Financial Exchanges & Data", "Finanzbörsen und Marktdaten"],
  ["Mortgage Real Estate Investment Trusts (REITs)", "Hypotheken-REITs"],
  ["Technology Hardware & Equipment", "Technologie-Hardware und Ausrüstung"],
  ["Electronic Equipment, Instruments & Components", "Elektronische Ausrüstung, Instrumente und Komponenten"],
  ["Semiconductors & Semiconductor Equipment", "Halbleiter und Halbleiterausrüstung"],
  ["Telecommunication Services", "Telekommunikationsdienste"],
  ["Diversified Telecommunication Services", "Diversifizierte Telekommunikationsdienste"],
  ["Wireless Telecommunication Services", "Drahtlose Telekommunikationsdienste"],
  ["Media & Entertainment", "Medien und Unterhaltung"],
  ["Independent Power and Renewable Electricity Producers", "Unabhängige Strom- und Erneuerbare-Erzeuger"],
  ["Equity Real Estate Investment Trusts (REITs)", "Aktien-REITs"],
  ["Real Estate Management & Development", "Immobilienmanagement und -entwicklung"],
  ["Real Estate Operating Companies", "Immobilienbetriebsgesellschaften"],
  ["Real Estate Development", "Immobilienentwicklung"],
  ["Real Estate Services", "Immobiliendienstleistungen"],
  ["Hotel & Resort REITs", "Hotel- und Resort-REITs"],
  ["Office REITs", "Büro-REITs"],
  ["Health Care REITs", "Healthcare-REITs"],
  ["Residential REITs", "Wohnimmobilien-REITs"],
  ["Multi-Family Residential REITs", "Mehrfamilienhaus-REITs"],
  ["Single-Family Residential REITs", "Einfamilienhaus-REITs"],
  ["Retail REITs", "Einzelhandels-REITs"],
  ["Specialized REITs", "Spezialisierte REITs"],
  ["Other Specialized REITs", "Andere spezialisierte REITs"],
  ["Self-Storage REITs", "Self-Storage-REITs"],
  ["Telecom Tower REITs", "Telekom-Tower-REITs"],
  ["Timber REITs", "Holz-REITs"],
  ["Data Center REITs", "Rechenzentrums-REITs"],
  ["Building Products", "Bauprodukte"],
  ["Construction & Engineering", "Bau und Ingenieurwesen"],
  ["Electrical Equipment", "Elektrische Ausrüstung"],
  ["Industrial Conglomerates", "Industriekonglomerate"],
  ["Trading Companies & Distributors", "Handelsunternehmen und Distributoren"],
  ["Household Durables", "Langlebige Haushaltsgüter"],
  ["Consumer Electronics", "Unterhaltungselektronik"],
  ["Home Furnishings", "Wohnmöbel"],
  ["Household Appliances", "Haushaltsgeräte"],
  ["Leisure Products", "Freizeitprodukte"],
  ["Hotels, Restaurants & Leisure", "Hotels, Restaurants und Freizeit"],
  ["Diversified Consumer Services", "Diversifizierte Verbraucherdienstleistungen"],
  ["Apparel Retail", "Bekleidungseinzelhandel"],
  ["Home Improvement Retail", "Baumarkt-Einzelhandel"],
  ["Automotive Retail", "Kfz-Einzelhandel"],
  ["Drug Retail", "Apothekeneinzelhandel"],
  ["Food Distributors", "Lebensmitteldistributoren"],
  ["Food Retail", "Lebensmitteleinzelhandel"],
  ["Consumer Staples Merchandise Retail", "Einzelhandel für Basiskonsumgüter"],
  ["Household Products", "Haushaltsprodukte"],
  ["Personal Products", "Körperpflegeprodukte"],
  ["Health Care Equipment", "Medizintechnik"],
  ["Health Care Supplies", "Medizinische Verbrauchsmaterialien"],
  ["Health Care Distributors", "Medizindistributoren"],
  ["Health Care Services", "Gesundheitsdienstleistungen"],
  ["Health Care Facilities", "Gesundheitseinrichtungen"],
  ["Managed Health Care", "Managed Care"],
  ["Health Care Technology", "Gesundheitstechnologie"],
  ["Life Sciences Tools & Services", "Life-Science-Werkzeuge und -Dienstleistungen"],
  ["Regional Banks", "Regionalbanken"],
  ["Specialized Finance", "Spezialfinanzierung"],
  ["Consumer Finance", "Konsumentenfinanzierung"],
  ["Capital Markets", "Kapitalmärkte"],
  ["Technology Distributors", "Technologie-Distributoren"],
  ["Internet Services & Infrastructure", "Internetdienste und -infrastruktur"],
  ["Integrated Telecommunication Services", "Integrierte Telekommunikationsdienste"],
  ["Alternative Carriers", "Alternative Netzbetreiber"],
  ["Independent Power Producers & Energy Traders", "Unabhängige Stromerzeuger und Energiehändler"],
  ["Renewable Electricity", "Erneuerbare Stromerzeugung"],
  ["Australia and New Zealand", "Australien und Neuseeland"],
  ["South-eastern Asia", "Südostasien"],
  ["Western Asia", "Westasien"],
  ["Central Asia", "Zentralasien"],
  ["Eastern Asia", "Ostasien"],
  ["Southern Asia", "Südasien"],
  ["Northern Africa", "Nordafrika"],
  ["Western Africa", "Westafrika"],
  ["Eastern Africa", "Ostafrika"],
  ["Middle Africa", "Zentralafrika"],
  ["Southern Africa", "Südliches Afrika"],
  ["Northern America", "Nordamerika"],
  ["Central America", "Mittelamerika"],
  ["South America", "Südamerika"],
  ["Northern Europe", "Nordeuropa"],
  ["Western Europe", "Westeuropa"],
  ["Eastern Europe", "Osteuropa"],
  ["Southern Europe", "Südeuropa"],
  ["Health Care", "Gesundheitswesen"],
  ["Information Technology", "Informationstechnologie"],
  ["Communication Services", "Kommunikationsdienste"],
  ["Consumer Discretionary", "Zyklischer Konsum"],
  ["Consumer Staples", "Nichtzyklischer Konsum"],
  ["Real Estate", "Immobilien"],
  ["Energy", "Energie"],
  ["Financials", "Finanzwerte"],
  ["Industrials", "Industrie"],
  ["Materials", "Grundstoffe"],
  ["Utilities", "Versorger"],
  ["Services", "Dienstleistungen"],
  ["Equipment", "Ausrüstung"],
  ["Products", "Produkte"],
  ["Product", "Produkt"],
  ["Equipment", "Ausrüstung"],
  ["Components", "Komponenten"],
  ["Component", "Komponente"],
  ["Drilling", "Bohrungen"],
  ["Exploration", "Exploration"],
  ["Production", "Förderung"],
  ["Refining", "Raffination"],
  ["Marketing", "Vermarktung"],
  ["Storage", "Speicherung"],
  ["Consumable Fuels", "Brennstoffe"],
  ["Coal", "Kohle"],
  ["Chemicals", "Chemikalien"],
  ["Industrial", "Industrielle"],
  ["Commodity", "Rohstoff"],
  ["Containers", "Behälter"],
  ["Packaging", "Verpackung"],
  ["Metals", "Metalle"],
  ["Mining", "Bergbau"],
  ["Gold", "Gold"],
  ["Silver", "Silber"],
  ["Steel", "Stahl"],
  ["Paper", "Papier"],
  ["Forests", "Forst"],
  ["Forest", "Forst"],
  ["Air Freight", "Luftfracht"],
  ["Logistics", "Logistik"],
  ["Airlines", "Fluggesellschaften"],
  ["Railroads", "Eisenbahnen"],
  ["Airport", "Flughafen"],
  ["Ports", "Häfen"],
  ["Passenger", "Passagier"],
  ["Cargo", "Fracht"],
  ["Consumer", "Konsum"],
  ["Automobiles", "Automobile"],
  ["Auto", "Auto"],
  ["Tires", "Reifen"],
  ["Rubber", "Gummi"],
  ["Apparel", "Bekleidung"],
  ["Luxury Goods", "Luxusgüter"],
  ["Restaurants", "Restaurants"],
  ["Casinos", "Kasinos"],
  ["Gaming", "Gaming"],
  ["Education", "Bildung"],
  ["Specialized", "Spezialisierte"],
  ["Distributors", "Distributoren"],
  ["Retail", "Einzelhandel"],
  ["Food", "Lebensmittel"],
  ["Beverage", "Getränke"],
  ["Beverages", "Getränke"],
  ["Tobacco", "Tabak"],
  ["Brewers", "Brauereien"],
  ["Soft Drinks", "Erfrischungsgetränke"],
  ["Household", "Haushalt"],
  ["Personal", "Körperpflege"],
  ["Providers", "Anbieter"],
  ["Facilities", "Einrichtungen"],
  ["Managed", "Gemanagte"],
  ["Pharmaceuticals", "Pharma"],
  ["Biotechnology", "Biotechnologie"],
  ["Life Sciences", "Lebenswissenschaften"],
  ["Banks", "Banken"],
  ["Insurance", "Versicherung"],
  ["Brokerage", "Brokerage"],
  ["Exchanges", "Börsen"],
  ["Data", "Daten"],
  ["Software", "Software"],
  ["Hardware", "Hardware"],
  ["Semiconductors", "Halbleiter"],
  ["Telecommunication", "Telekommunikation"],
  ["Media", "Medien"],
  ["Entertainment", "Unterhaltung"],
  ["Utilities", "Versorger"],
  ["Electricity", "Strom"],
  ["Renewable", "Erneuerbare"],
  ["Trusts", "Trusts"],
  ["REITs", "REITs"],
  ["Retail", "Einzelhandel"],
  ["Distribution", "Distribution"],
  ["Transportation", "Transport"],
  ["Infrastructure", "Infrastruktur"],
  ["Insurance", "Versicherung"],
  ["Banks", "Banken"],
  ["Markets", "Märkte"],
  ["Software", "Software"],
  ["Hardware", "Hardware"],
  ["Semiconductors", "Halbleiter"],
  ["Pharmaceuticals", "Pharma"],
  ["Biotechnology", "Biotechnologie"],
  ["Chemicals", "Chemie"],
  ["Metals", "Metalle"],
  ["Mining", "Bergbau"],
  ["Construction", "Bau"],
  ["Machinery", "Maschinenbau"],
  ["Aerospace", "Luft- und Raumfahrt"],
  ["Defense", "Verteidigung"],
  ["Airlines", "Fluggesellschaften"],
  ["Marine", "Schifffahrt"],
  ["Rail", "Bahn"],
  ["Road", "Straße"],
  ["Apparel", "Bekleidung"],
  ["Leisure", "Freizeit"],
  ["Education", "Bildung"],
  ["Distributors", "Distributoren"],
  ["Paper", "Papier"],
  ["Forest", "Forst"],
  ["Agricultural", "Landwirtschaftlich"],
  ["&", "und"],
];

function localizeIndustryName(t: TFunction, categoryName: string): string {
  const sectorKey = INDUSTRY_SECTOR_KEY_BY_NAME[categoryName];
  if (sectorKey) {
    return t(sectorKey, { defaultValue: categoryName });
  }

  let translated = categoryName;
  for (const [source, target] of INDUSTRY_TERM_REPLACEMENTS) {
    translated = translated.replaceAll(source, target);
  }
  return translated.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
}

/**
 * Localize system taxonomy names without mutating database values.
 * Falls back to DB-provided names when no i18n key exists.
 */
export function localizeTaxonomyName(t: TFunction, taxonomy: Taxonomy): string {
  if (!taxonomy.isSystem) return taxonomy.name;
  return t(`taxonomy.system.${taxonomy.id}.name`, { defaultValue: taxonomy.name });
}

/**
 * Localize system taxonomy category labels by stable category key.
 * Falls back to DB-provided names when no i18n key exists.
 */
export function localizeCategoryName(
  t: TFunction,
  taxonomy: Pick<Taxonomy, "id" | "isSystem"> | undefined,
  category: Pick<TaxonomyCategory, "name" | "key">,
): string {
  if (!taxonomy?.isSystem) return category.name;

  if (taxonomy.id === "regions") {
    if (category.key.startsWith("country_")) {
      return localizeRegionCountryName(category.key, category.name);
    }
    const mappedKey = REGION_KEY_BY_NAME[category.name];
    if (mappedKey) {
      return t(mappedKey, { defaultValue: category.name });
    }
    return category.name;
  }

  if (taxonomy.id === "industries_gics") {
    return localizeIndustryName(t, category.name);
  }

  return t(`taxonomy.system.${taxonomy.id}.category.${category.key}.name`, {
    defaultValue: category.name,
  });
}

/**
 * Localize system allocation category labels when only taxonomyId + display name is available.
 * Keeps domain-standard terms (e.g. ADR, GDR, Futures) unchanged.
 */
export function localizeAllocationCategoryName(
  t: TFunction,
  taxonomyId: string | undefined,
  categoryName: string,
): string {
  const normalized = categoryName.trim();
  if (!normalized) return categoryName;

  if (NON_TRANSLATED_CATEGORY_TERMS.has(normalized.toUpperCase())) {
    return categoryName;
  }

  if (normalized.toLowerCase().startsWith("cash:")) {
    const currencyCode = normalized.slice(5).trim();
    const cashLabel = t("taxonomy.system.asset_classes.category.CASH.name", {
      defaultValue: "Cash",
    });
    return currencyCode ? `${cashLabel} (${currencyCode})` : cashLabel;
  }

  const keyByName: Record<string, string> = {
    Equity: "taxonomy.system.asset_classes.category.EQUITY.name",
    Cash: "taxonomy.system.asset_classes.category.CASH.name",
    "Fixed Income": "taxonomy.system.asset_classes.category.FIXED_INCOME.name",
    "Real Estate": "taxonomy.system.asset_classes.category.REAL_ESTATE.name",
    Commodities: "taxonomy.system.asset_classes.category.COMMODITIES.name",
    Alternatives: "taxonomy.system.asset_classes.category.ALTERNATIVES.name",
    "Digital Assets": "taxonomy.system.asset_classes.category.DIGITAL_ASSETS.name",
    Low: "taxonomy.system.risk_category.category.LOW.name",
    Medium: "taxonomy.system.risk_category.category.MEDIUM.name",
    High: "taxonomy.system.risk_category.category.HIGH.name",
    Unknown: "taxonomy.system.risk_category.category.UNKNOWN.name",
    ...REGION_KEY_BY_NAME,
    ...INDUSTRY_SECTOR_KEY_BY_NAME,
    Stocks: "taxonomy.system.instrument_type.category.EQUITY_SECURITY.name",
    Bonds: "taxonomy.system.instrument_type.category.DEBT_SECURITY.name",
    Funds: "taxonomy.system.instrument_type.category.FUND.name",
    ETFs: "taxonomy.system.instrument_type.category.ETP.name",
    "Options & Futures": "taxonomy.system.instrument_type.category.DERIVATIVE.name",
    "Cash & FX": "taxonomy.system.instrument_type.category.CASH_FX.name",
    "Structured Notes": "taxonomy.system.instrument_type.category.STRUCTURED.name",
    "Structured Note": "taxonomy.system.instrument_type.category.STRUCTURED_NOTE.name",
    "Market-Linked Note": "taxonomy.system.instrument_type.category.MARKET_LINKED_NOTE.name",
    "Credit-Linked Note": "taxonomy.system.instrument_type.category.CREDIT_LINKED_NOTE.name",
    "Physical Assets": "taxonomy.system.instrument_type.category.REAL_ASSET.name",
    "Physical Commodity": "taxonomy.system.instrument_type.category.PHYSICAL_COMMODITY.name",
    "Physical Gold / Silver": "taxonomy.system.instrument_type.category.PHYSICAL_METAL.name",
    "Direct Real Estate": "taxonomy.system.instrument_type.category.DIRECT_REAL_ESTATE.name",
    Crypto: "taxonomy.system.instrument_type.category.DIGITAL_ASSET.name",
    Cryptocurrency: "taxonomy.system.instrument_type.category.CRYPTO_NATIVE.name",
    Stablecoin: "taxonomy.system.instrument_type.category.STABLECOIN.name",
    "Tokenized Asset": "taxonomy.system.instrument_type.category.TOKENIZED_SECURITY.name",
    "Private Investments": "taxonomy.system.instrument_type.category.PRIVATE_VEHICLE.name",
    "Private Company Shares": "taxonomy.system.instrument_type.category.PRIVATE_COMPANY.name",
    "Private Loan / Note": "taxonomy.system.instrument_type.category.PRIVATE_LOAN.name",
    "SPV / Private Vehicle": "taxonomy.system.instrument_type.category.SPV.name",
    Other: "taxonomy.system.instrument_type.category.OTHER.name",
    "Unknown Instrument": "taxonomy.system.instrument_type.category.OTHER_UNKNOWN.name",
    "Synthetic / Internal Position":
      "taxonomy.system.instrument_type.category.SYNTHETIC_INTERNAL.name",
    Stock: "taxonomy.system.instrument_type.category.STOCK_COMMON.name",
    "Preferred Stock": "taxonomy.system.instrument_type.category.STOCK_PREFERRED.name",
    "Warrant / Right": "taxonomy.system.instrument_type.category.EQUITY_WARRANT_RIGHT.name",
    "Partnership / Trust Unit": "taxonomy.system.instrument_type.category.PARTNERSHIP_UNIT.name",
    "Government Bond": "taxonomy.system.instrument_type.category.BOND_GOVERNMENT.name",
    "Corporate Bond": "taxonomy.system.instrument_type.category.BOND_CORPORATE.name",
    "Municipal Bond": "taxonomy.system.instrument_type.category.BOND_MUNICIPAL.name",
    "Convertible / Hybrid Bond":
      "taxonomy.system.instrument_type.category.BOND_CONVERTIBLE.name",
    "T-Bills / CDs / Commercial Paper":
      "taxonomy.system.instrument_type.category.MONEY_MARKET_DEBT.name",
    "Mutual Fund": "taxonomy.system.instrument_type.category.FUND_MUTUAL.name",
    "Closed-End Fund (CEF)": "taxonomy.system.instrument_type.category.FUND_CLOSED_END.name",
    "Private / Hedge Fund": "taxonomy.system.instrument_type.category.FUND_PRIVATE.name",
    "Fund of Funds": "taxonomy.system.instrument_type.category.FUND_FOF.name",
    "Commodity ETP (ETC/ETP)": "taxonomy.system.instrument_type.category.ETC.name",
    Option: "taxonomy.system.instrument_type.category.OPTION.name",
    "Forward / Swap (OTC)": "taxonomy.system.instrument_type.category.OTC_DERIVATIVE.name",
    "Cash Balance": "taxonomy.system.instrument_type.category.CASH.name",
    "Bank Deposit / Sweep": "taxonomy.system.instrument_type.category.DEPOSIT.name",
    "Currency Position": "taxonomy.system.instrument_type.category.FX_POSITION.name",
    "Bank Deposits": "taxonomy.system.instrument_type.category.BANK_DEPOSITS.name",
  };

  const mappedKey = keyByName[normalized];
  if (mappedKey) {
    return t(mappedKey, { defaultValue: categoryName });
  }

  if (taxonomyId === "industries_gics") {
    return localizeIndustryName(t, categoryName);
  }

  if (taxonomyId) {
    return t(`taxonomy.system.${taxonomyId}.category.${normalized}.name`, {
      defaultValue: categoryName,
    });
  }

  return categoryName;
}
