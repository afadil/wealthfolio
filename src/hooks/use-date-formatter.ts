import { format, isValid, parseISO } from "date-fns";
import { enUS as en, vi } from "date-fns/locale";
import { useTranslation } from "react-i18next";

/**
 * Hook for providing localized date formatting functions
 * Returns formatters that adapt to the current language setting
 */
export function useDateFormatter() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  // Map i18n language codes to date-fns locales
  const getDateFnsLocale = () => {
    switch (currentLang) {
      case "vi":
        return vi;
      case "en":
      default:
        return en;
    }
  };

  // Format date for chart X-axis based on date range
  const formatChartDate = (date: Date | string, dateRange?: { from: Date; to: Date }) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    // If date range is provided, choose appropriate format
    if (dateRange) {
      const daysDiff = Math.ceil(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24),
      );
      const monthsDiff = Math.ceil(daysDiff / 30);

      if (daysDiff <= 31) {
        // Use different formats for Vietnamese vs English
        if (currentLang === "vi") {
          return format(dateObj, "d/MM", { locale }); // Vietnamese: "15/9"
        }
        return format(dateObj, "MMM d", { locale }); // English: "Sep 15"
      }
      if (monthsDiff <= 36) {
        if (currentLang === "vi") {
          return format(dateObj, "MM/yyyy", { locale }); // Vietnamese: "09/2023"
        }
        return format(dateObj, "MMM yyyy", { locale }); // English: "Sep 2023"
      }
      return format(dateObj, "yyyy", { locale }); // e.g., "2023"
    }

    // Default format for chart axis
    if (currentLang === "vi") {
      return format(dateObj, "d/MM", { locale }); // Vietnamese: "15/9"
    }
    return format(dateObj, "MMM d", { locale }); // English: "Sep 15"
  };

  // Format date for mobile chart X-axis (more compact)
  const formatChartDateMobile = (date: Date | string, dateRange?: { from: Date; to: Date }) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    // If date range is provided, choose appropriate format
    if (dateRange) {
      const daysDiff = Math.ceil(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24),
      );
      const monthsDiff = Math.ceil(daysDiff / 30);

      if (daysDiff <= 7) {
        if (currentLang === "vi") {
          return format(dateObj, "d/MM", { locale }); // Vietnamese: "15/9"
        }
        return format(dateObj, "MMM d", { locale }); // English: "Sep 15"
      }
      if (daysDiff <= 31) {
        if (currentLang === "vi") {
          return format(dateObj, "d/MM", { locale }); // Vietnamese: "15/9"
        }
        return format(dateObj, "MMM d", { locale }); // English: "Sep 15"
      }
      if (monthsDiff <= 12) {
        if (currentLang === "vi") {
          return format(dateObj, "MM", { locale }); // Vietnamese: "09"
        }
        return format(dateObj, "MMM", { locale }); // English: "Sep"
      }
      if (monthsDiff <= 36) {
        if (currentLang === "vi") {
          return format(dateObj, "MM/yy", { locale }); // Vietnamese: "09/23"
        }
        return format(dateObj, "MMM yy", { locale }); // English: "Sep 23"
      }
      return format(dateObj, "yyyy", { locale }); // e.g., "2023"
    }

    // Default format for mobile chart
    if (currentLang === "vi") {
      return format(dateObj, "d/MM", { locale }); // Vietnamese: "15/9"
    }
    return format(dateObj, "MMM d", { locale }); // English: "Sep 15"
  };

  // Format date for chart tooltips (more verbose)
  const formatChartTooltip = (date: Date | string) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    // Use different formats based on language
    if (currentLang === "vi") {
      return format(dateObj, "dd/MM/yyyy", { locale }); // Vietnamese: "15/09/2023"
    }
    return format(dateObj, "PPP", { locale }); // English: "September 15, 2023"
  };

  // Format date for mobile chart tooltips (compact but readable)
  const formatChartTooltipMobile = (date: Date | string) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    // Use different formats based on language
    if (currentLang === "vi") {
      return format(dateObj, "dd/MM/yyyy", { locale }); // Vietnamese: "15/09/2023"
    }
    return format(dateObj, "MMM d, yyyy", { locale }); // English: "Sep 15, 2023"
  };

  // Format date for activity lists and tables
  const formatActivityDate = (date: Date | string) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    // Use different formats based on language
    if (currentLang === "vi") {
      return format(dateObj, "dd/MM/yyyy", { locale }); // Vietnamese: "15/09/2023"
    }
    return format(dateObj, "MMM dd, yyyy", { locale }); // English: "Sep 15, 2023"
  };

  // Format date for income chart (compact)
  const formatIncomeChartDate = (date: Date | string, isMobile = false) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    if (currentLang === "vi") {
      return isMobile ? format(dateObj, "MM", { locale }) : format(dateObj, "MM/yy", { locale });
    }
    return isMobile ? format(dateObj, "MMM", { locale }) : format(dateObj, "MMM yy", { locale });
  };

  // Format date and time for display (localized)
  const formatDateTimeDisplay = (date: Date | string) => {
    const dateObj = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(dateObj)) return "";

    const locale = getDateFnsLocale();

    // Use different formats based on language
    if (currentLang === "vi") {
      return format(dateObj, "HH:mm dd/MM/yyyy", { locale }); // Vietnamese: "14:30 05/09/2023"
    }
    return format(dateObj, "MMM dd, yyyy h:mm a", { locale }); // English: "Sep 15, 2023 2:30 PM"
  };

  return {
    formatChartDate,
    formatChartDateMobile,
    formatChartTooltip,
    formatChartTooltipMobile,
    formatActivityDate,
    formatIncomeChartDate,
    formatDateTimeDisplay,
  };
}
