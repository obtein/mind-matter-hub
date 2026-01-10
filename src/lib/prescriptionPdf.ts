import jsPDF from "jspdf";

interface PrescriptionData {
  patientName: string;
  appointmentDate: string;
  doctorName: string;
  medications: {
    medication_name: string;
    dosage: string | null;
    instructions: string | null;
  }[];
}

export const generatePrescriptionPdf = (data: PrescriptionData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("REÇETE", pageWidth / 2, 25, { align: "center" });
  
  // Line under header
  doc.setLineWidth(0.5);
  doc.line(20, 32, pageWidth - 20, 32);
  
  // Doctor info
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Doktor:", 20, 45);
  doc.setFont("helvetica", "normal");
  doc.text(data.doctorName, 45, 45);
  
  // Date
  doc.setFont("helvetica", "bold");
  doc.text("Tarih:", pageWidth - 70, 45);
  doc.setFont("helvetica", "normal");
  doc.text(data.appointmentDate, pageWidth - 50, 45);
  
  // Patient info
  doc.setFont("helvetica", "bold");
  doc.text("Hasta:", 20, 55);
  doc.setFont("helvetica", "normal");
  doc.text(data.patientName, 45, 55);
  
  // Medications section
  doc.setLineWidth(0.3);
  doc.line(20, 65, pageWidth - 20, 65);
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Ilac Listesi", 20, 78);
  
  let yPosition = 90;
  
  data.medications.forEach((med, index) => {
    // Check if we need a new page
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 30;
    }
    
    // Medication number and name
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`${index + 1}. ${med.medication_name}`, 25, yPosition);
    
    yPosition += 7;
    
    // Dosage
    if (med.dosage) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Doz: ${med.dosage}`, 30, yPosition);
      yPosition += 6;
    }
    
    // Instructions
    if (med.instructions) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      
      // Handle long instructions with word wrap
      const lines = doc.splitTextToSize(`Kullanim: ${med.instructions}`, pageWidth - 60);
      lines.forEach((line: string) => {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 30;
        }
        doc.text(line, 30, yPosition);
        yPosition += 5;
      });
    }
    
    yPosition += 8;
  });
  
  // Footer line
  const footerY = 275;
  doc.setLineWidth(0.3);
  doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);
  
  // Footer text
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Bu recete elektronik olarak olusturulmustur.", pageWidth / 2, footerY, { align: "center" });
  
  // Signature area
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Imza: ____________________", pageWidth - 70, footerY - 20);
  
  // Generate filename
  const fileName = `recete_${data.patientName.replace(/\s+/g, "_")}_${data.appointmentDate.replace(/[\/\s:]/g, "-")}.pdf`;
  
  // Save the PDF
  doc.save(fileName);
};
