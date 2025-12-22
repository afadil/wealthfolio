use chrono::NaiveDate;

pub fn get_days_between(start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
    if start > end {
        return Vec::new();
    }
    let mut days = Vec::new();
    let mut current = start;
    while current <= end {
        days.push(current);
        if let Some(next) = current.succ_opt() {
            current = next;
        } else {
            // Should not happen for typical date ranges
            break;
        }
    }
    days
}
