/**
 * File này tuân thủ Kiến trúc GAS (chạy trong môi trường Google Apps Script)
 * Xử lý logic nghiệp vụ gọi API tới hệ thống EasyInvoice.
 */

// Thông số tài khoản tĩnh (bạn có thể đưa vào PropertiesService sau nếu cần bảo mật hơn)
var EASYINVOICE_CONFIG = {
  DOMAIN: "http://api.softdreams.vn", // Môi trường Test. Product đổi thành api.easyinvoice.vn
  // DOMAIN: "https://api.easyinvoice.vn",
  USERNAME: "api",
  PASSWORD: "123456aA@",
  TAX_CODE: "001180032645",
  PATTERN: "2C26MAA", // Mẫu số + Ký hiệu
  SERIAL: "", // Nếu gộp vào Pattern thì bỏ trống
  DEFAULT_VAT_RATE: -1, // -1: Không chịu thuế, 0: 0%, 5: 5%, 10: 10%
};

/**
 * Hàm tạo chuỗi Header Authentication theo chuẩn EasyInvoice v8.0 cho domain mới
 */
function generateEasyInvoiceToken_(httpMethod) {
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var nonce = Utilities.getUuid().replace(/-/g, "").toLowerCase();

  var signatureRawData = httpMethod.toUpperCase() + timestamp + nonce;

  var hash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    signatureRawData,
    Utilities.Charset.UTF_8,
  );
  var signature = Utilities.base64Encode(hash);

  return (
    signature +
    ":" +
    nonce +
    ":" +
    timestamp +
    ":" +
    EASYINVOICE_CONFIG.USERNAME +
    ":" +
    EASYINVOICE_CONFIG.PASSWORD +
    ":" +
    EASYINVOICE_CONFIG.TAX_CODE
  );
}

/**
 * Gọi API tới hệ thống EasyInvoice
 */
function callEasyInvoiceApi_(endpoint, payload) {
  var url =
    EASYINVOICE_CONFIG.DOMAIN +
    (endpoint.indexOf("/") === 0 ? endpoint : "/" + endpoint);

  // Method mặc định cho các API nghiệp vụ của EasyInvoice thường là POST
  var method = "POST";
  var token = generateEasyInvoiceToken_(method);

  var options = {
    method: method,
    contentType: "application/json",
    headers: {
      Authentication: token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();

  try {
    var result = JSON.parse(responseText);
    return {
      status: responseCode,
      data: result,
    };
  } catch (e) {
    return {
      status: responseCode,
      error: "Không thể parse JSON từ API: " + responseText,
    };
  }
}

/**
 * Gọi API tới hệ thống EasyInvoice nhưng lấy về dữ liệu Blob (Dành cho PDF/XML)
 */
function callEasyInvoiceApiBlob_(endpoint, payload) {
  var url =
    EASYINVOICE_CONFIG.DOMAIN +
    (endpoint.indexOf("/") === 0 ? endpoint : "/" + endpoint);

  var method = "POST";
  var token = generateEasyInvoiceToken_(method);

  var options = {
    method: method,
    contentType: "application/json",
    headers: {
      Authentication: token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var responseCode = response.getResponseCode();

  if (responseCode === 200) {
    return {
      status: 200,
      blob: response.getBlob(),
    };
  } else {
    return {
      status: responseCode,
      error: "Lỗi khi tải file: " + response.getContentText(),
    };
  }
}

/**
 * Ánh xạ trạng thái hóa đơn theo Phụ lục VII.2 Tài liệu v8.0 (NĐ123/TT78)
 */
function getReadableStatus_(rawStatus) {
  var statusMap = {
    "-1": "Chờ ký (-1)",
    "0": "Nháp (0)",
    "1": "Đã phát hành (1)",
    "2": "CQT đã cấp mã (2)",
    "3": "Bị thay thế (3)",
    "4": "Bị điều chỉnh (4)",
    "5": "Đã hủy (5)",
    "6": "Đã duyệt (6)",
  };
  return statusMap[String(rawStatus)] || "Mã trạng thái: " + rawStatus;
}

/**
 * Đọc số tiền thành chữ
 */
function docSoThanhChu(so) {
  if (so === 0) return "Không đồng";
  var chuSo = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  var donVi = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  var count = 0;
  var str = "";
  var phanNguyen = Math.floor(so);
  while (phanNguyen > 0) {
    var num = phanNguyen % 1000;
    phanNguyen = Math.floor(phanNguyen / 1000);
    if (num > 0) {
      var s3 = "";
      var tram = Math.floor(num / 100);
      var chuc = Math.floor((num % 100) / 10);
      var donvi = num % 10;
      if (tram > 0) s3 += chuSo[tram] + " trăm ";
      else if (phanNguyen > 0) s3 += "không trăm ";

      if (chuc > 1) s3 += chuSo[chuc] + " mươi ";
      else if (chuc === 1) s3 += "mười ";
      else if (chuc === 0 && donvi > 0 && num > 9) s3 += "lẻ ";

      if (donvi === 1 && chuc > 1) s3 += "mốt ";
      else if (donvi === 5 && chuc > 0) s3 += "lăm ";
      else if (donvi > 0) s3 += chuSo[donvi] + " ";

      str = s3 + donVi[count] + " " + str;
    }
    count++;
  }
  var result = str.replace(/\s+/g, " ").trim();
  return result.charAt(0).toUpperCase() + result.slice(1) + " đồng";
}

/**
 * Tạo dữ liệu XML cho danh sách sản phẩm.
 */
function buildProductsXml_(products) {
  var xml = "<Products>";
  var totalAmountBeforeTax = 0;
  var totalVatAmount = 0;

  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var stt = i + 1;
    var name = String(p.name || "").trim() || "Sản phẩm không tên";
    var unit = String(p.unit || "").trim() || "Cái";
    var quantity = Number(p.quantity || 0);
    var price = Number(p.price || 0); // Đơn giá đã hoặc chưa thuế phụ thuộc vào logic
    var totalAmount = quantity * price; // Tổng tiền trước thuế của SP

    var vatRate = EASYINVOICE_CONFIG.DEFAULT_VAT_RATE;
    var vatAmount = 0;
    var amountAfterTax = totalAmount;

    // Logic tính ngược nếu hệ thống của bạn (Tổng tiền Google Sheet) "Đã Bao Gồm Thuế"
    // Nếu bạn muốn tính 10% tiền thuế, và "price" ở đây là giá đã gồm thuế 10%:
    // totalAmountBeforeTax_thuc = totalAmount / 1.1;
    // Nhưng để giữ chuẩn dữ liệu khớp với Sheet nhất, ở đây đang mặc định lấy VAT = -1 (Không chịu thuế).

    if (vatRate === 10) {
      vatAmount = totalAmount * 0.1;
      amountAfterTax = totalAmount + vatAmount;
    } else if (vatRate === 5) {
      vatAmount = totalAmount * 0.05;
      amountAfterTax = totalAmount + vatAmount;
    }

    totalAmountBeforeTax += totalAmount;
    totalVatAmount += vatAmount;

    xml += "<Product>";
    xml += "<Code>SP" + stt + "</Code>";
    xml += "<No>" + stt + "</No>";
    xml += "<Feature>1</Feature>"; // 1: HH/DV; 2: Khuyến mại; 3: CK; 4: Ghi chú
    xml += "<ProdName>" + name + "</ProdName>";
    xml += "<ProdUnit>" + unit + "</ProdUnit>";
    xml += "<ProdQuantity>" + quantity + "</ProdQuantity>";
    xml += "<ProdPrice>" + price + "</ProdPrice>";
    xml += "<Total>" + totalAmount + "</Total>";
    xml += "<VATRate>" + vatRate + "</VATRate>";
    xml += "<VATAmount>" + vatAmount + "</VATAmount>";
    xml += "<Amount>" + amountAfterTax + "</Amount>";
    xml += "</Product>";
  }

  xml += "</Products>";

  var grandTotal = totalAmountBeforeTax + totalVatAmount;

  // Phần tổng hóa đơn
  xml += "<Total>" + totalAmountBeforeTax + "</Total>";
  xml += "<VATRate>" + EASYINVOICE_CONFIG.DEFAULT_VAT_RATE + "</VATRate>";
  xml += "<VATAmount>" + totalVatAmount + "</VATAmount>";
  xml += "<Amount>" + grandTotal + "</Amount>";

  // Tùy chỉnh đọc số tiền thành chữ nếu cần, có thể sinh trống để server EasyInvoice tự nối hoặc bắt buộc theo Format.
  // Trong nhiều trường hợp API tự tính AmountInWords từ Amount.
  var words = docSoThanhChu(grandTotal);
  xml += "<AmountInWords>" + words + "</AmountInWords>";

  return xml;
}

/**
 * Xây dựng XML cho 1 hoá đơn (1 Invoice)
 */
function buildInvoiceXml_(orderData, isReplace, newIkey) {
  var ikey = newIkey || orderData.id || Utilities.getUuid().replace(/-/g, "").toLowerCase();

  var xml = isReplace ? "<ReplaceInv>" : "<Inv><Invoice>";
  xml += "<Ikey>" + ikey + "</Ikey>";
  
  // Format ngày dd/MM/yyyy từ orderData.ngayBan (nếu có dạng YYYY-MM-DD), hoặc ngày hiện tại
  var arisingDate = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
  if (orderData.ngayBan) {
    var parts = orderData.ngayBan.split("-");
    if (parts.length === 3) {
       arisingDate = parts[2] + "/" + parts[1] + "/" + parts[0];
    }
  }
  xml += "<ArisingDate>" + arisingDate + "</ArisingDate>";

  // Khách hàng
  xml +=
    "<CusCode>" +
    (orderData.customerPhone || orderData.customerCode || "KHLE") +
    "</CusCode>"; // Mã KH ưu tiên số ĐT, mặc định Khách Lẻ
  xml +=
    "<CusName>" + (orderData.customerName || "Khách mua lẻ") + "</CusName>";
  xml += "<Buyer>" + (orderData.customerName || "Khách mua lẻ") + "</Buyer>";
  if (orderData.customerAddress) {
    xml += "<CusAddress>" + orderData.customerAddress + "</CusAddress>";
  }
  if (orderData.customerPhone) {
    xml += "<CusPhone>" + orderData.customerPhone + "</CusPhone>";
  }

  // Cần truyền <Type>2</Type> đối với HĐ thay thế theo Docs (mặc định lấy là 2)?
  // Nhưng Docs của <ReplaceInv> không ghi có <Type>. Nó chỉ cho <AdjustInv>.
  // Thôi cứ theo y hệt cấu trúc <Invoice>. 
  xml += "<PaymentMethod>Tiền mặt/Chuyển khoản</PaymentMethod>";
  xml += "<CurrencyUnit>VND</CurrencyUnit>";

  // Sản phẩm
  xml += buildProductsXml_(orderData.products || []);

  xml += isReplace ? "</ReplaceInv>" : "</Invoice></Inv>";
  return xml;
}

/**
 * Hàm xuất API "Tạo và Phát hành Hóa đơn" (Ký Server/HSM)
 * Docs: III.3
 *
 * @param {Object} orderData Object gồm khách hàng và mảng sản phẩm.
 */
function publishInvoiceHSM(orderData) {
  try {
    var xmlData = "<Invoices>" + buildInvoiceXml_(orderData, false) + "</Invoices>";

    var payload = {
      Pattern: EASYINVOICE_CONFIG.PATTERN,
      Serial: EASYINVOICE_CONFIG.SERIAL,
      XmlData: xmlData,
    };

    var result = callEasyInvoiceApi_(
      "api/publish/importAndIssueInvoice",
      payload,
    );

    // API EasyInvoice trả về HTTP Status = 200, trường Status trong data = 2 (Thành công)
    if (result.status === 200 && result.data && result.data.Status === 2) {
      // Thành công
      var invoices =
        result.data.Data && result.data.Data.Invoices
          ? result.data.Data.Invoices
          : [];
      var firstInv = invoices.length > 0 ? invoices[0] : {};

      var firstInv = invoices.length > 0 ? invoices[0] : {};
 
      var readableStatus = getReadableStatus_(firstInv.InvoiceStatus);

      return {
        success: true,
        message: "Phát hành hóa đơn thành công!",
        invoiceNo: firstInv.No || "",
        lookupCode: firstInv.LookupCode || "",
        statusText: readableStatus,
        taxAuthorityCode: firstInv.TaxAuthorityCode || "",
        ikey: Object.keys(result.data.Data.KeyInvoiceNo)[0],
      };
    } else {
      // Lỗi trả về từ EasyInvoice
      return {
        success: false,
        message:
          "Lỗi phát hành từ EasyInvoice: " +
          (result.data ? result.data.Message : "Unknown"),
        details: result.data || result.error,
      };
    }
  } catch (e) {
    return {
      success: false,
      message: "Exception nội bộ khi xuất hóa đơn: " + e.message,
    };
  }
}

/**
 * Hàm Hủy hóa đơn đã phát hành (Ký Server)
 * Lưu ý: Đối với TT78, nếu hóa đơn đã có mã CQT, có thể cần gửi Thông báo sai sót (V.34) thay vì chỉ gọi lệnh hủy này.
 */
function cancelInvoiceHSM(ikey, pattern, serial) {
  try {
    var payload = {
      Ikey: ikey,
      Pattern: pattern || EASYINVOICE_CONFIG.PATTERN,
      Serial: serial || EASYINVOICE_CONFIG.SERIAL,
    };

    var result = callEasyInvoiceApi_(
      "api/business/cancelInvoice",
      payload,
    );

    if (result.status === 200 && result.data && result.data.Status === 2) {
      return {
        success: true,
        message: "Hủy hóa đơn trên hệ thống thành công!",
      };
    } else {
      return {
        success: false,
        message:
          "Lỗi hủy từ EasyInvoice: " +
          (result.data ? result.data.Message : "Unknown"),
        details: result.data || result.error,
      };
    }
  } catch (e) {
    return {
      success: false,
      message: "Exception nội bộ khi hủy hóa đơn: " + e.message,
    };
  }
}

/**
 * Hàm Thông báo sai sót (Mẫu 04/SS-HĐĐT) - Mục V.34 Tài liệu v8.0
 * Sử dụng khi hóa đơn đã được CQT cấp mã và cần Hủy hoặc Giải trình.
 */
function sendErrorNoticeHSM(invoiceDetails) {
  try {
    // invoiceDetails: { pattern, serial, no, arisingDate, taxAuthorityCode, note, invType }
    var payload = {
      TypeNoti: 1, // 1: Thông báo hủy/giải trình của NNT
      TaxAuthNo: null,
      TaxAuthDate: null,
      CreateDate: Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy"),
      Province: "Tỉnh/Thành phố", // Có thể cấu hình thêm trong EASYINVOICE_CONFIG
      ErrorList: [
        {
          Pattern: invoiceDetails.pattern,
          Serial: invoiceDetails.serial || "",
          TaxAuthorityCode: invoiceDetails.taxAuthorityCode || "", // Bắt buộc nếu là hđ có mã
          No: invoiceDetails.no,
          ArisingDate: invoiceDetails.arisingDate,
          InvType: invoiceDetails.invType || 1, // 1: HĐĐT theo NĐ123
          Note: invoiceDetails.note || "Hủy hóa đơn sai sót",
        },
      ],
    };

    var result = callEasyInvoiceApi_(
      "api/business/sendErrorNotice",
      payload,
    );

    if (result.status === 200 && result.data && result.data.Status === 2) {
      return {
        success: true,
        message: "Gửi thông báo sai sót (Mẫu 04) thành công!",
      };
    } else {
      return {
        success: false,
        message:
          "Lỗi gửi thông báo sai sót: " +
          (result.data ? result.data.Message : "Unknown"),
        details: result.data || result.error,
      };
    }
  } catch (e) {
    return {
      success: false,
      message: "Exception nội bộ khi gửi thông báo sai sót: " + e.message,
    };
  }
}

/**
 * Hàm Thay Thế Hóa Đơn (Replace Invoice)
 * API: api/business/replaceInvoice
 * Bổ sung RelatedInvoice để tuân thủ TT78/v8.0
 */
function replaceInvoiceHSM(oldIkey, newIkey, orderData, relatedInvoiceInfo) {
  try {
    var xmlData = buildInvoiceXml_(orderData, true, newIkey);

    var payload = {
      Ikey: oldIkey || orderData.id,
      Pattern: EASYINVOICE_CONFIG.PATTERN,
      Serial: EASYINVOICE_CONFIG.SERIAL,
      XmlData: xmlData,
    };

    // Bổ sung RelatedInvoice cho thông tư 78
    if (relatedInvoiceInfo) {
      payload.RelatedInvoice = {
        Pattern: relatedInvoiceInfo.pattern,
        Serial: relatedInvoiceInfo.serial || "",
        No: relatedInvoiceInfo.no,
        ArisingDate: relatedInvoiceInfo.arisingDate,
        RelatedType: 1, // 1: Thay thế cho hóa đơn thông tư 78
      };
    }

    var result = callEasyInvoiceApi_(
      "api/business/replaceInvoice",
      payload,
    );

    if (result.status === 200 && result.data && result.data.Status === 2) {
      var invoices =
        result.data.Data && result.data.Data.Invoices
          ? result.data.Data.Invoices
          : [];
      var firstInv = invoices.length > 0 ? invoices[0] : {};

      var readableStatus = getReadableStatus_(firstInv.InvoiceStatus);

      return {
        success: true,
        message: "Thay thế hóa đơn thành công!",
        invoiceNo: firstInv.No || "",
        lookupCode: firstInv.LookupCode || "",
        taxAuthorityCode: firstInv.TaxAuthorityCode || "",
        statusText: readableStatus,
        ikey: newIkey,
      };
    } else {
      return {
        success: false,
        message:
          "Lỗi thay thế từ EasyInvoice: " +
          (result.data ? result.data.Message : "Unknown"),
        details: result.data || result.error,
      };
    }
  } catch (e) {
    return {
      success: false,
      message: "Exception nội bộ khi thay thế hóa đơn: " + e.message,
    };
  }
}

/**
 * Lấy thông tin chi tiết hóa đơn theo Ikey
 * Dùng để điền vào RelatedInvoice hoặc Mẫu 04
 */
function getInvoiceDetailsHSM(ikey) {
  try {
    var result = callEasyInvoiceApi_("api/publish/getInvoicesByIkeys", {
      Ikeys: [ikey],
    });

    if (result.status === 200 && result.data && result.data.Status === 2) {
      var invoices =
        result.data.Data && result.data.Data.Invoices
          ? result.data.Data.Invoices
          : [];
      if (invoices.length > 0) {
        var inv = invoices[0];
        return {
          success: true,
          data: inv,
          taxAuthorityCode: inv.TaxAuthorityCode || "",
        };
      }
      return {
        success: false,
        message: "Không tìm thấy thông tin hóa đơn trên hệ thống.",
      };
    }
    return {
      success: false,
      message:
        "Lỗi truy vấn hóa đơn: " +
        (result.data ? result.data.Message : "Unknown"),
    };
  } catch (e) {
    return { success: false, message: "Exception truy vấn hóa đơn: " + e.message };
  }
}

/**
 * Tải file PDF/XML hóa đơn
 * API: api/publish/getInvoicePdf (V.24)
 * @param {string} ikey 
 * @param {number} option -1: XML, 0: PDF thông thường, 1: PDF chứng minh nguồn gốc, 2: PDF lưu trữ
 */
function getInvoicePdfBlobHSM(ikey, option) {
  try {
    var payload = {
      Ikey: ikey,
      Pattern: EASYINVOICE_CONFIG.PATTERN,
      Option: option === undefined ? 0 : option // Mặc định 0 là PDF thông thường
    };

    var result = callEasyInvoiceApiBlob_("api/publish/getInvoicePdf", payload);
    if (result.status === 200) {
      return {
        success: true,
        blob: result.blob
      };
    } else {
      return {
        success: false,
        message: "Lỗi EasyInvoice: " + (result.error || "Không thể tải file")
      };
    }
  } catch (e) {
    return { success: false, message: "Lỗi khi gọi API tải file: " + e.message };
  }
}

// Xuất cho môi trường Bundle
export {
  publishInvoiceHSM,
  cancelInvoiceHSM,
  replaceInvoiceHSM,
  sendErrorNoticeHSM,
  getInvoiceDetailsHSM,
  getInvoicePdfBlobHSM,
};
