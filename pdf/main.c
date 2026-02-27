#include <stdio.h>
#include <string.h>

/* 
 * 最小化 PDF + JavaScript 產生程式
 * 1. Object 1 (Catalog) 加入了 /OpenAction 指向 Object 6
 * 2. Object 6 定義了 JavaScript 動作
 */

long offsets[10];
int obj_count = 1;
long current_offset = 0;

void pdf_write(FILE *f, const char *str) {
    size_t len = strlen(str);
    fwrite(str, 1, len, f);
    current_offset += len;
}

void pdf_start_obj(FILE *f) {
    offsets[obj_count] = current_offset;
    char buf[32];
    sprintf(buf, "%d 0 obj\n", obj_count);
    pdf_write(f, buf);
}

void pdf_end_obj(FILE *f) {
    pdf_write(f, "endobj\n");
    obj_count++;
}

int main() {
    FILE *f = fopen("js_output.pdf", "wb");
    if (!f) return 1;

    // 1. PDF Header
    pdf_write(f, "%PDF-1.4\n");

    // 2. 物件定義
    
    // Obj 1: Catalog (文件入口)
    // /OpenAction 6 0 R 代表開啟時執行物件 6 定義的動作
    pdf_start_obj(f);
    pdf_write(f, "<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>\n");
    pdf_end_obj(f);

    // Obj 2: Pages
    pdf_start_obj(f);
    pdf_write(f, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
    pdf_end_obj(f);

    // Obj 3: Page
    pdf_start_obj(f);
    pdf_write(f, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n");
    pdf_end_obj(f);

    // Obj 4: Contents (頁面文字內容)
    const char *content = "BT /F1 24 Tf 100 700 Td (PDF with JavaScript) Tj ET";
    pdf_start_obj(f);
    char stream_header[64];
    sprintf(stream_header, "<< /Length %zu >>\nstream\n", strlen(content));
    pdf_write(f, stream_header);
    pdf_write(f, content);
    pdf_write(f, "\nendstream\n");
    pdf_end_obj(f);

    // Obj 5: Font (內建 Helvetica)
    pdf_start_obj(f);
    pdf_write(f, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n");
    pdf_end_obj(f);

    // Obj 6: JavaScript Action
    // /S /JavaScript 指定動作類型
    // /JS () 內放的是腳本內容
    pdf_start_obj(f);
    pdf_write(f, "<< /Type /Action /S /JavaScript /JS (app.alert('Hello from PDF JavaScript!');) >>\n");
    pdf_end_obj(f);

    // 3. Xref Table
    long xref_start = current_offset;
    pdf_write(f, "xref\n");
    char xref_header[32];
    sprintf(xref_header, "0 %d\n", obj_count);
    pdf_write(f, xref_header);
    
    pdf_write(f, "0000000000 65535 f \n");
    for (int i = 1; i < obj_count; i++) {
        char entry[32];
        sprintf(entry, "%010ld 00000 n \n", offsets[i]);
        pdf_write(f, entry);
    }

    // 4. Trailer
    pdf_write(f, "trailer\n");
    char trailer_buf[64];
    sprintf(trailer_buf, "<< /Size %d /Root 1 0 R >>\n", obj_count);
    pdf_write(f, trailer_buf);
    
    pdf_write(f, "startxref\n");
    char startxref_buf[32];
    sprintf(startxref_buf, "%ld\n", xref_start);
    pdf_write(f, startxref_buf);
    pdf_write(f, "%%EOF\n");

    fclose(f);
    printf("JS PDF 產生成功！請編譯並執行以獲得 js_output.pdf。\n");
    return 0;
}