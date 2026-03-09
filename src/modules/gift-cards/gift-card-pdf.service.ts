import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class GiftCardPdfService {
  private readonly logger = new Logger(GiftCardPdfService.name);
  private readonly templatePath = join(
    process.cwd(),
    'assets',
    'gift-card-template.pdf',
  );

  /**
   * Generar PDF de gift card desde template
   */
  async generateGiftCardPDF(data: {
    code: string;
    amount: number;
    recipientName: string;
    purchaserName: string;
    expirationDate: string;
    personalMessage?: string;
  }): Promise<Buffer> {
    try {
      // Cargar template de la doctora
      const templateBytes = await fs.readFile(this.templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);

      // Obtener primera página
      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();

      // Cargar fuentes
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Color rosa de la marca (#E91E63)
      const pinkColor = rgb(0.91, 0.12, 0.39);
      const grayColor = rgb(0.4, 0.4, 0.4);
      const blackColor = rgb(0, 0, 0);

      // 🎨 POSICIONES - AJUSTA SEGÚN TU TEMPLATE
      // Estas coordenadas son ejemplos, debes ajustarlas según el diseño real

      // Código de Gift Card (grande, centrado arriba)
      page.drawText(data.code, {
        x: this.centerText(data.code, width, 28, font),
        y: height - 338.6, // Ajustar según template
        size: 28,
        font: font,
        color: pinkColor,
      });

      // Monto (muy grande, destacado)
      const amountText = `$${data.amount.toLocaleString('es-AR')}`;
      page.drawText(amountText, {
        x: this.centerText(amountText, width, 35, font),
        y: height - 276.9,
        size: 35,
        font: font,
        color: pinkColor,
      });

      // Para (beneficiario)
      page.drawText(`Para: ${data.recipientName}`, {
        x: 80,
        y: height - 253.7,
        size: 14,
        font: font,
        color: blackColor,
      });

      // De (comprador)
      page.drawText(`De: ${data.purchaserName}`, {
        x: 80,
        y: height - 212.1,
        size: 14,
        font: font,
        color: blackColor,
      });

      // Válida hasta
      const expirationFormatted = new Date(
        data.expirationDate,
      ).toLocaleDateString('es-AR');
      page.drawText(`Válida hasta: ${expirationFormatted}`, {
        x: 80,
        y: height - 187.3,
        size: 12,
        font: font,
        color: grayColor,
      });

      // // Mensaje personalizado (si existe)
      // if (data.personalMessage) {
      //   const maxWidth = width - 160; // 80px margen cada lado
      //   const wrappedMessage = this.wrapText(
      //     data.personalMessage,
      //     maxWidth,
      //     11,
      //     font,
      //   );

      //   let yPosition = height - 450;
      //   page.drawText('Mensaje:', {
      //     x: 80,
      //     y: yPosition,
      //     size: 12,
      //     font: fontBold,
      //     color: blackColor,
      //   });

      //   yPosition -= 20;
      //   wrappedMessage.forEach((line) => {
      //     page.drawText(line, {
      //       x: 80,
      //       y: yPosition,
      //       size: 11,
      //       font: font,
      //       color: grayColor,
      //     });
      //     yPosition -= 15;
      //   });
      // }

      // // Instrucciones de uso (parte inferior)
      // const instructions = [
      //   '¿Cómo usar tu Gift Card?',
      //   '1. Agendá tu turno por WhatsApp: +54 9 341 7511529',
      //   '2. Presentá tu código al agendar',
      //   '3. ¡Disfrutá del tratamiento que elijas!',
      // ];

      // let yInstructions = 180; // Desde abajo
      // page.drawText(instructions[0], {
      //   x: 80,
      //   y: yInstructions,
      //   size: 12,
      //   font: fontBold,
      //   color: pinkColor,
      // });

      // yInstructions -= 25;
      // instructions.slice(1).forEach((instruction) => {
      //   page.drawText(instruction, {
      //     x: 80,
      //     y: yInstructions,
      //     size: 10,
      //     font: font,
      //     color: blackColor,
      //   });
      //   yInstructions -= 18;
      // });

      // // Condiciones (muy abajo)
      // const conditions = [
      //   'Válida por 90 días | No reembolsable | Puede usarse en uno o más tratamientos',
      // ];

      // page.drawText(conditions[0], {
      //   x: this.centerText(conditions[0], width, 8, font),
      //   y: 50,
      //   size: 8,
      //   font: font,
      //   color: grayColor,
      // });

      // // Footer con contacto
      // page.drawText('Dra. Jaqueline Grassetti | @dra.jaquelinagrassetti', {
      //   x: this.centerText(
      //     'Dra. Jaqueline Grassetti | @dra.jaquelinagrassetti',
      //     width,
      //     9,
      //     font,
      //   ),
      //   y: 30,
      //   size: 9,
      //   font: font,
      //   color: grayColor,
      // });

      // Generar PDF final
      const pdfBytes = await pdfDoc.save();

      this.logger.log(`📄 PDF generado para gift card: ${data.code}`);

      return Buffer.from(pdfBytes);
    } catch (error) {
      this.logger.error('Error generando PDF de gift card:', error);

      // Si el template no existe, generar PDF básico
      if (error.code === 'ENOENT') {
        this.logger.warn('⚠️ Template PDF no encontrado, generando PDF básico');
        return await this.generateBasicPDF(data);
      }

      throw error;
    }
  }

  /**
   * Generar PDF básico sin template (fallback)
   */
  private async generateBasicPDF(data: {
    code: string;
    amount: number;
    recipientName: string;
    purchaserName: string;
    expirationDate: string;
  }): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pinkColor = rgb(0.91, 0.12, 0.39);
    const grayColor = rgb(0.4, 0.4, 0.4);

    // Título
    page.drawText('GIFT CARD', {
      x: this.centerText('GIFT CARD', width, 36, fontBold),
      y: height - 100,
      size: 36,
      font: fontBold,
      color: pinkColor,
    });

    // Logo/Nombre
    page.drawText('DRA. JAQUELINE GRASSETTI', {
      x: this.centerText('DRA. JAQUELINE GRASSETTI', width, 18, fontBold),
      y: height - 140,
      size: 18,
      font: fontBold,
      color: pinkColor,
    });

    page.drawText('medicina estética', {
      x: this.centerText('medicina estética', width, 12, font),
      y: height - 160,
      size: 12,
      font: font,
      color: grayColor,
    });

    // Código
    page.drawText('Código de Gift Card', {
      x: this.centerText('Código de Gift Card', width, 12, font),
      y: height - 220,
      size: 12,
      font: font,
      color: grayColor,
    });

    page.drawText(data.code, {
      x: this.centerText(data.code, width, 28, fontBold),
      y: height - 250,
      size: 28,
      font: fontBold,
      color: pinkColor,
    });

    // Monto
    const amountText = `$${data.amount.toLocaleString('es-AR')}`;
    page.drawText(amountText, {
      x: this.centerText(amountText, width, 48, fontBold),
      y: height - 320,
      size: 48,
      font: fontBold,
      color: pinkColor,
    });

    // Datos
    let yPos = height - 400;
    const info = [
      `Para: ${data.recipientName}`,
      `De: ${data.purchaserName}`,
      `Válida hasta: ${new Date(data.expirationDate).toLocaleDateString('es-AR')}`,
    ];

    info.forEach((line) => {
      page.drawText(line, {
        x: 100,
        y: yPos,
        size: 14,
        font: font,
        color: grayColor,
      });
      yPos -= 30;
    });

    // Instrucciones
    yPos = 250;
    const instructions = [
      '¿Cómo usar tu Gift Card?',
      '1. Agendá tu turno por WhatsApp: +54 9 341 7511529',
      '2. Presentá tu código al agendar',
      '3. ¡Disfrutá del tratamiento que elijas!',
    ];

    page.drawText(instructions[0], {
      x: 100,
      y: yPos,
      size: 14,
      font: fontBold,
      color: pinkColor,
    });

    yPos -= 25;
    instructions.slice(1).forEach((line) => {
      page.drawText(line, {
        x: 100,
        y: yPos,
        size: 11,
        font: font,
        color: grayColor,
      });
      yPos -= 20;
    });

    // Footer
    page.drawText(
      'Válida por 90 días | No reembolsable | Puede usarse en uno o más tratamientos',
      {
        x: this.centerText(
          'Válida por 90 días | No reembolsable | Puede usarse en uno o más tratamientos',
          width,
          8,
          font,
        ),
        y: 60,
        size: 8,
        font: font,
        color: grayColor,
      },
    );

    page.drawText('Junín 191, Piso VIII, Consultorio I, Rosario - Sta. Fe', {
      x: this.centerText(
        'Junín 191, Piso VIII, Consultorio I, Rosario - Sta. Fe',
        width,
        9,
        font,
      ),
      y: 40,
      size: 9,
      font: font,
      color: grayColor,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Centrar texto horizontalmente
   */
  private centerText(
    text: string,
    pageWidth: number,
    fontSize: number,
    font: any,
  ): number {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    return (pageWidth - textWidth) / 2;
  }

  /**
   * Dividir texto en líneas según ancho máximo
   */
  private wrapText(
    text: string,
    maxWidth: number,
    fontSize: number,
    font: any,
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}
