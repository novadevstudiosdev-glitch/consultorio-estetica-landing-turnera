import { Injectable, Logger } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
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
  private readonly arterioFontPath = join(
    process.cwd(),
    'assets',
    'ArterioNonCommercial.otf',
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
      const templateBytes = await fs.readFile(this.templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);

      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();

      // Fuentes
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fallbackDisplayFont = await pdfDoc.embedFont(
        StandardFonts.TimesRomanItalic,
      );
      const displayFont = await this.getDisplayFont(
        pdfDoc,
        fallbackDisplayFont,
      );

      // Color principal
      const brandColor = rgb(0.769, 0.478, 0.522); // #c47a85
      const grayColor = rgb(0.4, 0.4, 0.4);

      // Posiciones (las que ajustaste)
      page.drawText(data.code, {
        x: this.centerText(data.code, width, 20, displayFont),
        y: height - 160,
        size: 20,
        font: displayFont,
        color: brandColor,
      });

      const amountText = `$${data.amount.toLocaleString('es-AR')}`;
      page.drawText(amountText, {
        x: this.centerText(amountText, width, 20, displayFont),
        y: height - 200,
        size: 20,
        font: displayFont,
        color: brandColor,
      });

      // // Para (beneficiario)
      // page.drawText(`Para: ${data.recipientName}`, {
      //   x: 80,
      //   y: height - 220,
      //   size: 14,
      //   font: font,
      //   color: rgb(0, 0, 0),
      // });

      // // De (comprador)
      // page.drawText(`De: ${data.purchaserName}`, {
      //   x: 80,
      //   y: height - 240,
      //   size: 14,
      //   font: font,
      //   color: rgb(0, 0, 0),
      // });

      const expirationFormatted = new Date(
        data.expirationDate,
      ).toLocaleDateString('es-AR');
      page.drawText(`Valida hasta: ${expirationFormatted}`, {
        x: 80,
        y: height - 240,
        size: 12,
        font,
        color: grayColor,
      });

      // Bloques ocultos temporalmente (mantenidos comentados):
      // - Mensaje personalizado
      // - Instrucciones de uso
      // - Condiciones
      // - Footer con contacto

      const pdfBytes = await pdfDoc.save();
      this.logger.log(`PDF generado para gift card: ${data.code}`);
      return Buffer.from(pdfBytes);
    } catch (error: any) {
      this.logger.error('Error generando PDF de gift card:', error);

      if (error?.code === 'ENOENT') {
        this.logger.warn('Template PDF no encontrado, generando PDF basico');
        return await this.generateBasicPDF(data);
      }

      throw error;
    }
  }

  /**
   * Fallback sin template
   */
  private async generateBasicPDF(data: {
    code: string;
    amount: number;
    recipientName: string;
    purchaserName: string;
    expirationDate: string;
  }): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const grayColor = rgb(0.4, 0.4, 0.4);
    const brandColor = rgb(0.769, 0.478, 0.522);

    const fallbackDisplayFont = await pdfDoc.embedFont(
      StandardFonts.TimesRomanItalic,
    );
    const displayFont = await this.getDisplayFont(pdfDoc, fallbackDisplayFont);

    page.drawText(data.code, {
      x: this.centerText(data.code, width, 28, displayFont),
      y: height - 250,
      size: 28,
      font: displayFont,
      color: brandColor,
    });

    const amountText = `$${data.amount.toLocaleString('es-AR')}`;
    page.drawText(amountText, {
      x: this.centerText(amountText, width, 35, displayFont),
      y: height - 320,
      size: 35,
      font: displayFont,
      color: brandColor,
    });

    const expirationFormatted = new Date(
      data.expirationDate,
    ).toLocaleDateString('es-AR');
    page.drawText(`Valida hasta: ${expirationFormatted}`, {
      x: this.centerText(
        `Valida hasta: ${expirationFormatted}`,
        width,
        12,
        font,
      ),
      y: height - 410,
      size: 12,
      font,
      color: grayColor,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private centerText(
    text: string,
    pageWidth: number,
    fontSize: number,
    font: PDFFont,
  ): number {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    return (pageWidth - textWidth) / 2;
  }

  private async getDisplayFont(
    pdfDoc: PDFDocument,
    fallbackFont: PDFFont,
  ): Promise<PDFFont> {
    try {
      pdfDoc.registerFontkit(fontkit);
      const fontBytes = await fs.readFile(this.arterioFontPath);
      const arterioFont = await pdfDoc.embedFont(fontBytes);
      this.logger.log(
        'Fuente PDF: ArterioNonCommercial.otf cargada correctamente.',
      );
      return arterioFont;
    } catch (error) {
      this.logger.warn(
        'No se pudo cargar ArterioNonCommercial.otf; usando fallback.',
      );
      return fallbackFont;
    }
  }
}
