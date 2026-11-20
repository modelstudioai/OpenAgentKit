package org.openagentkit.server.controller;

import org.openagentkit.server.KitError;
import org.openagentkit.server.service.FileUpload;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.util.List;

import javax.servlet.http.HttpServletRequest;

final class Uploads {
    private Uploads() {}

    static FileUpload single(HttpServletRequest request) {
        if (!(request instanceof MultipartHttpServletRequest)) throw KitError.invalid("请上传一个文件");
        List<MultipartFile> files = ((MultipartHttpServletRequest) request).getFiles("file");
        if (files.size() != 1) throw KitError.invalid("请上传一个文件");
        MultipartFile file = files.get(0);
        return new FileUpload(file.getOriginalFilename(), file.getContentType(), file.getSize(), file::getBytes);
    }
}
