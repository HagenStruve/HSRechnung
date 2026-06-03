package tools.facturx;

import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.OffsetDateTime;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDMarkInfo;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.text.PDFTextStripper;

public final class FacturXPdfBoxEmbedder {
  private static final String EMBEDDED_FILE_NAME = "factur-x.xml";

  private FacturXPdfBoxEmbedder() {
  }

  public static void main(String[] args) throws Exception {
    if (args.length == 2 && "--inspect".equals(args[0])) {
      inspect(new File(args[1]));
      return;
    }

    if (args.length != 3) {
      System.err.println("Usage: FacturXPdfBoxEmbedder <source.pdf> <factur-x.xml> <output.pdf>");
      System.err.println("   or: FacturXPdfBoxEmbedder --inspect <input.pdf>");
      System.exit(2);
    }

    embed(new File(args[0]), new File(args[1]), new File(args[2]));
  }

  private static void embed(File sourcePdf, File xmlFile, File outputPdf) throws IOException {
    byte[] xmlBytes = Files.readAllBytes(xmlFile.toPath());
    try (PDDocument document = Loader.loadPDF(sourcePdf)) {
      document.setVersion(1.7f);
      document.setAllSecurityToBeRemoved(true);

      PDDocumentCatalog catalog = document.getDocumentCatalog();
      catalog.setVersion("1.7");
      catalog.setLanguage("de-DE");

      PDMarkInfo markInfo = new PDMarkInfo();
      markInfo.setMarked(true);
      catalog.setMarkInfo(markInfo);

      addOutputIntentIfMissing(document, catalog);

      PDComplexFileSpecification fileSpec = new PDComplexFileSpecification();
      fileSpec.setFile(EMBEDDED_FILE_NAME);
      fileSpec.setFileUnicode(EMBEDDED_FILE_NAME);
      fileSpec.setFileDescription("Factur-X/ZUGFeRD invoice data");

      PDEmbeddedFile embeddedFile = new PDEmbeddedFile(document, new ByteArrayInputStream(xmlBytes), COSName.FLATE_DECODE);
      embeddedFile.setSubtype("text/xml");
      embeddedFile.setSize(xmlBytes.length);
      embeddedFile.setCreationDate(Calendar.getInstance());
      embeddedFile.setModDate(Calendar.getInstance());
      fileSpec.setEmbeddedFile(embeddedFile);
      fileSpec.setEmbeddedFileUnicode(embeddedFile);
      fileSpec.getCOSObject().setName(COSName.getPDFName("AFRelationship"), "Alternative");

      PDEmbeddedFilesNameTreeNode embeddedFiles = new PDEmbeddedFilesNameTreeNode();
      embeddedFiles.setNames(Map.of(EMBEDDED_FILE_NAME, fileSpec));
      PDDocumentNameDictionary names = new PDDocumentNameDictionary(catalog);
      names.setEmbeddedFiles(embeddedFiles);
      catalog.setNames(names);

      COSArray associatedFiles = new COSArray();
      associatedFiles.add(fileSpec.getCOSObject());
      catalog.getCOSObject().setItem(COSName.getPDFName("AF"), associatedFiles);

      PDDocumentInformation info = document.getDocumentInformation();
      info.setTitle("Rechnung");
      info.setCreator("HSRechnung");
      info.setProducer("HSRechnung Factur-X PDFBox Adapter");
      info.setModificationDate(GregorianCalendar.from(OffsetDateTime.now().toZonedDateTime()));
      document.setDocumentInformation(info);

      PDMetadata metadata = new PDMetadata(document);
      metadata.importXMPMetadata(buildXmp().getBytes(StandardCharsets.UTF_8));
      catalog.setMetadata(metadata);

      outputPdf.getParentFile().mkdirs();
      document.save(outputPdf);
    }
  }

  private static void addOutputIntentIfMissing(PDDocument document, PDDocumentCatalog catalog) throws IOException {
    if (!catalog.getOutputIntents().isEmpty()) return;
    ICC_Profile profile = ICC_Profile.getInstance(ColorSpace.CS_sRGB);
    try (InputStream stream = new ByteArrayInputStream(profile.getData())) {
      PDOutputIntent intent = new PDOutputIntent(document, stream);
      intent.setInfo("sRGB IEC61966-2.1");
      intent.setOutputCondition("sRGB IEC61966-2.1");
      intent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
      intent.setRegistryName("http://www.color.org");
      catalog.addOutputIntent(intent);
    }
  }

  private static void inspect(File pdf) throws IOException {
    try (PDDocument document = Loader.loadPDF(pdf)) {
      PDDocumentCatalog catalog = document.getDocumentCatalog();
      Map<String, String> values = new LinkedHashMap<>();
      values.put("pages", Integer.toString(document.getNumberOfPages()));

      Map<String, PDComplexFileSpecification> attachments = Map.of();
      if (catalog.getNames() != null && catalog.getNames().getEmbeddedFiles() != null) {
        Map<String, PDComplexFileSpecification> names = catalog.getNames().getEmbeddedFiles().getNames();
        if (names != null) attachments = names;
      }
      String attachmentNames = attachments.keySet().stream().sorted().collect(Collectors.joining(","));
      values.put("attachments", attachmentNames);
      values.put("hasFacturXXml", Boolean.toString(attachments.containsKey(EMBEDDED_FILE_NAME)));

      String xmp = "";
      if (catalog.getMetadata() != null) {
        xmp = new String(catalog.getMetadata().exportXMPMetadata().readAllBytes(), StandardCharsets.UTF_8);
      }
      values.put("pdfaPart", firstMatch(xmp, "<pdfaid:part>([^<]+)</pdfaid:part>"));
      values.put("pdfaConformance", firstMatch(xmp, "<pdfaid:conformance>([^<]+)</pdfaid:conformance>"));
      values.put("profile", firstMatch(xmp, "<fx:ConformanceLevel>([^<]+)</fx:ConformanceLevel>"));
      String text = new PDFTextStripper().getText(document);
      values.put("hasHsrechnungLayout", Boolean.toString(text.contains("HSRechnung") || text.contains("Hof Struve Lohnunternehmen")));
      values.put("hasSampleLayout", Boolean.toString(text.contains("RE-2026-SAMPLE")));
      values.put("hasMustangDataPage", Boolean.toString(text.contains("Daten der E-Rechnung")));

      for (Map.Entry<String, String> entry : values.entrySet()) {
        System.out.println(entry.getKey() + "=" + entry.getValue());
      }
    }
  }

  private static String firstMatch(String text, String regex) {
    Matcher matcher = Pattern.compile(regex, Pattern.DOTALL).matcher(text);
    return matcher.find() ? matcher.group(1) : "";
  }

  private static String buildXmp() {
    return """
      <?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
      <x:xmpmeta xmlns:x="adobe:ns:meta/">
        <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                 xmlns:dc="http://purl.org/dc/elements/1.1/"
                 xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
                 xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
                 xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
                 xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
                 xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"
                 xmlns:xmp="http://ns.adobe.com/xap/1.0/"
                 xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
          <rdf:Description rdf:about="">
            <pdf:Producer>HSRechnung Factur-X PDFBox Adapter</pdf:Producer>
          </rdf:Description>
          <rdf:Description rdf:about="">
            <pdfaid:part>3</pdfaid:part>
            <pdfaid:conformance>B</pdfaid:conformance>
          </rdf:Description>
          <rdf:Description rdf:about="">
            <dc:format>application/pdf</dc:format>
            <dc:title>
              <rdf:Alt>
                <rdf:li xml:lang="x-default">Rechnung</rdf:li>
              </rdf:Alt>
            </dc:title>
          </rdf:Description>
          <rdf:Description rdf:about="">
            <xmp:CreatorTool>HSRechnung</xmp:CreatorTool>
          </rdf:Description>
          <rdf:Description rdf:about="">
            <fx:DocumentType>INVOICE</fx:DocumentType>
            <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
            <fx:Version>1.0</fx:Version>
            <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
          </rdf:Description>
          <rdf:Description rdf:about="">
            <pdfaExtension:schemas>
              <rdf:Bag>
                <rdf:li rdf:parseType="Resource">
                  <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                  <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
                  <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                  <pdfaSchema:property>
                    <rdf:Seq>
                      <rdf:li rdf:parseType="Resource">
                        <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                        <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                        <pdfaProperty:category>external</pdfaProperty:category>
                        <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                      </rdf:li>
                      <rdf:li rdf:parseType="Resource">
                        <pdfaProperty:name>DocumentType</pdfaProperty:name>
                        <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                        <pdfaProperty:category>external</pdfaProperty:category>
                        <pdfaProperty:description>INVOICE</pdfaProperty:description>
                      </rdf:li>
                      <rdf:li rdf:parseType="Resource">
                        <pdfaProperty:name>Version</pdfaProperty:name>
                        <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                        <pdfaProperty:category>external</pdfaProperty:category>
                        <pdfaProperty:description>Factur-X/ZUGFeRD version</pdfaProperty:description>
                      </rdf:li>
                      <rdf:li rdf:parseType="Resource">
                        <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                        <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                        <pdfaProperty:category>external</pdfaProperty:category>
                        <pdfaProperty:description>Factur-X/ZUGFeRD conformance level</pdfaProperty:description>
                      </rdf:li>
                    </rdf:Seq>
                  </pdfaSchema:property>
                </rdf:li>
              </rdf:Bag>
            </pdfaExtension:schemas>
          </rdf:Description>
        </rdf:RDF>
      </x:xmpmeta>
      <?xpacket end="w"?>
      """;
  }
}
