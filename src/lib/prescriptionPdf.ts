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

// Roboto Regular font in base64 - supports Turkish characters
const ROBOTO_FONT_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf";

const loadFont = async (): Promise<string> => {
  const response = await fetch(ROBOTO_FONT_URL);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );
  return base64;
};

export const generatePrescriptionPdf = async (data: PrescriptionData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Load and add custom font for Turkish character support
  try {
    const fontBase64 = await loadFont();
    doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto");
  } catch (error) {
    console.warn("Could not load custom font, using default");
  }
  
  // Header
  doc.setFontSize(22);
  doc.text("REÇETE", pageWidth / 2, 25, { align: "center" });
  
  // Line under header
  doc.setLineWidth(0.5);
  doc.line(20, 32, pageWidth - 20, 32);
  
  // Doctor info
  doc.setFontSize(12);
  doc.text("Doktor:", 20, 45);
  doc.text(data.doctorName, 45, 45);
  
  // Date
  doc.text("Tarih:", pageWidth - 70, 45);
  doc.text(data.appointmentDate, pageWidth - 50, 45);
  
  // Patient info
  doc.text("Hasta:", 20, 55);
  doc.text(data.patientName, 45, 55);
  
  // Medications section
  doc.setLineWidth(0.3);
  doc.line(20, 65, pageWidth - 20, 65);
  
  doc.setFontSize(14);
  doc.text("İlaç Listesi", 20, 78);
  
  let yPosition = 90;
  
  data.medications.forEach((med, index) => {
    // Check if we need a new page
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 30;
    }
    
    // Medication number and name
    doc.setFontSize(12);
    doc.text(`${index + 1}. ${med.medication_name}`, 25, yPosition);
    
    yPosition += 7;
    
    // Dosage
    if (med.dosage) {
      doc.setFontSize(10);
      doc.text(`Doz: ${med.dosage}`, 30, yPosition);
      yPosition += 6;
    }
    
    // Instructions
    if (med.instructions) {
      doc.setFontSize(10);
      
      // Handle long instructions with word wrap
      const lines = doc.splitTextToSize(`Kullanım: ${med.instructions}`, pageWidth - 60);
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
  doc.text("Bu reçete elektronik olarak oluşturulmuştur.", pageWidth / 2, footerY, { align: "center" });
  
  // Signature area
  doc.setFontSize(10);
  doc.text("İmza: ____________________", pageWidth - 70, footerY - 20);
  
  // Generate filename
  const fileName = `recete_${data.patientName.replace(/\s+/g, "_")}_${data.appointmentDate.replace(/[\/\s:]/g, "-")}.pdf`;
  
  // Save the PDF
  doc.save(fileName);
};
