import { useOrderSchedule } from '../orderForm/useOrderSchedule'

export const useDashboardCountdown = ({ location = '' } = {}) => {
  const schedule = useOrderSchedule({ location })
  return {
    countdownLabel: schedule.countdownLabel,
    countdownValue: schedule.countdownValue,
    countdownTone: schedule.countdownTone,
    schedule
  }
}
