import type { DbService, AppointmentInsert, Appointment } from "@/services/db";

export class AppointmentRepository {
  constructor(private db: DbService) {}
  getByDateRange(start: string, end: string) { return this.db.getAppointmentsByDateRange(start, end); }
  getByPatient(patientId: string) { return this.db.getAppointmentsByPatient(patientId); }
  getById(id: string) { return this.db.getAppointment(id); }
  create(data: AppointmentInsert) { return this.db.createAppointment(data); }
  update(id: string, data: Partial<Pick<Appointment, "notes" | "status">>) { return this.db.updateAppointment(id, data); }
  delete(id: string) { return this.db.deleteAppointment(id); }
  getMonthlyDates(start: string, end: string) { return this.db.getMonthlyAppointmentDates(start, end); }
  getForStats() { return this.db.getAppointmentsForStats(); }
  getForConflictCheck(dayStart: string, dayEnd: string, excludeId?: string) { return this.db.getAppointmentsForConflictCheck(dayStart, dayEnd, excludeId); }
  getUpcoming(now: string, tomorrow: string) { return this.db.getUpcomingAppointments(now, tomorrow); }
}
