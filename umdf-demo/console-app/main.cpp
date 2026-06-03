#include <windows.h>
#include <setupapi.h>
#include <initguid.h>
#include <stdio.h>
#include <string.h>

// Link against Windows Setup API library
#pragma comment(lib, "setupapi.lib")

// Define the matching Device Interface GUID (must match driver.h)
// {7c3a0df4-df82-4f36-a191-236b3f7f8936}
DEFINE_GUID(GUID_DEVINTERFACE_UMDF_DEMO, 
    0x7c3a0df4, 0xdf82, 0x4f36, 0xa1, 0x91, 0x23, 0x6b, 0x3f, 0x7f, 0x89, 0x36);

// Define the matching IOCTL code (must match driver.h)
#define IOCTL_UMDF_DEMO_REVERSE_STRING \
    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS)

/**
 * GetDevicePath:
 * Uses Windows SetupDi APIs to query the operating system registry
 * and find the device interface path for our registered driver GUID.
 */
BOOL GetDevicePath(LPGUID InterfaceGuid, LPTSTR DevicePath, DWORD DevicePathSize) {
    HDEVINFO deviceInfoSet;
    SP_DEVICE_INTERFACE_DATA interfaceData;
    PSP_DEVICE_INTERFACE_DETAIL_DATA detailData = NULL;
    ULONG length;
    BOOL status = FALSE;

    // 1. Get a list of all devices exposing our specific device interface GUID
    deviceInfoSet = SetupDiGetClassDevs(
        InterfaceGuid,
        NULL,
        NULL,
        DIGCF_PRESENT | DIGCF_DEVICEINTERFACE
    );

    if (deviceInfoSet == INVALID_HANDLE_VALUE) {
        printf("[錯誤] SetupDiGetClassDevs 失敗，Error: %lu\n", GetLastError());
        return FALSE;
    }

    interfaceData.cbSize = sizeof(SP_DEVICE_INTERFACE_DATA);

    // 2. Retrieve the first interface (index 0) exposing this GUID
    if (SetupDiEnumDeviceInterfaces(deviceInfoSet, NULL, InterfaceGuid, 0, &interfaceData)) {
        // Query required buffer size for interface details
        SetupDiGetDeviceInterfaceDetail(deviceInfoSet, &interfaceData, NULL, 0, &length, NULL);

        detailData = (PSP_DEVICE_INTERFACE_DETAIL_DATA)malloc(length);
        if (detailData == NULL) {
            SetupDiDestroyDeviceInfoList(deviceInfoSet);
            return FALSE;
        }
        detailData->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA);

        // 3. Get the actual device interface detail path (DevicePath)
        if (SetupDiGetDeviceInterfaceDetail(deviceInfoSet, &interfaceData, detailData, length, NULL, NULL)) {
            wcscpy_s((wchar_t*)DevicePath, DevicePathSize / sizeof(wchar_t), (wchar_t*)detailData->DevicePath);
            status = TRUE;
        } else {
            printf("[錯誤] SetupDiGetDeviceInterfaceDetail 失敗，Error: %lu\n", GetLastError());
        }
        free(detailData);
    } else {
        printf("[錯誤] 找不到匹配的裝置介面！請確認 UMDF 驅動程式是否已成功安裝且啟動。\n");
    }

    SetupDiDestroyDeviceInfoList(deviceInfoSet);
    return status;
}

int main() {
    WCHAR devicePath[MAX_PATH] = { 0 };
    HANDLE hDevice = INVALID_HANDLE_VALUE;

    printf("==================================================\n");
    printf("   UMDF v2 Client Console Application\n");
    printf("==================================================\n\n");

    // 1. Find the device path using the driver interface GUID
    printf("[步驟 1] 正在尋找 UMDF 驅動裝置介面...\n");
    if (!GetDevicePath((LPGUID)&GUID_DEVINTERFACE_UMDF_DEMO, (LPTSTR)devicePath, sizeof(devicePath))) {
        printf("[偵退] 無法獲取裝置路徑。程式結束。\n");
        system("pause");
        return -1;
    }
    wprintf(L"[成功] 找到裝置路徑: %s\n\n", devicePath);

    // 2. Open a handle to the device using CreateFile
    printf("[步驟 2] 正在開啟裝置控制代碼...\n");
    hDevice = CreateFile(
        (LPCWSTR)devicePath,
        GENERIC_READ | GENERIC_WRITE,
        0,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    if (hDevice == INVALID_HANDLE_VALUE) {
        printf("[錯誤] CreateFile 開啟裝置失敗，Error: %lu\n", GetLastError());
        system("pause");
        return -1;
    }
    printf("[成功] 裝置控制代碼已成功開啟！\n\n");

    // 3. Accept input and communicate with the driver using DeviceIoControl
    char inputMsg[256] = { 0 };
    char outputMsg[256] = { 0 };
    DWORD bytesReturned = 0;

    printf("請輸入你想發送給 UMDF 驅動程式的字串（長度小於 250 字元）：\n> ");
    if (fgets(inputMsg, sizeof(inputMsg), stdin) != NULL) {
        // Strip trailing newline character
        size_t len = strlen(inputMsg);
        if (len > 0 && inputMsg[len - 1] == '\n') {
            inputMsg[len - 1] = '\0';
        }
    }

    printf("\n[步驟 3] 正在發送 IOCTL 到驅動程式 (WUDFHost.exe)...\n");
    
    // Call DeviceIoControl to pass the input buffer and receive the reversed output buffer
    BOOL success = DeviceIoControl(
        hDevice,
        IOCTL_UMDF_DEMO_REVERSE_STRING,
        inputMsg,
        (DWORD)strlen(inputMsg) + 1, // Include null terminator
        outputMsg,
        sizeof(outputMsg),
        &bytesReturned,
        NULL
    );

    if (success) {
        printf("[成功] 驅動程式回傳了 %lu 位元組的資料！\n", bytesReturned);
        printf("==================================================\n");
        printf(" 原始字串: \"%s\"\n", inputMsg);
        printf(" 驅動處理 (反轉): \"%s\"\n", outputMsg);
        printf("==================================================\n\n");
    } else {
        printf("[錯誤] DeviceIoControl 請求失敗，Error: %lu\n", GetLastError());
    }

    // 4. Close the handle when done
    printf("[步驟 4] 正在關閉裝置控制代碼...\n");
    CloseHandle(hDevice);
    printf("[成功] 控制代碼已關閉。程式結束。\n");

    system("pause");
    return 0;
}
