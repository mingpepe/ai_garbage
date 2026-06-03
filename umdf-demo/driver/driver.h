#pragma once

#include <windows.h>
#include <initguid.h>
#include <wdf.h>

// 1. Define a unique Device Interface GUID. 
// The client console app will use this GUID to locate and open our driver device interface.
// {7c3a0df4-df82-4f36-a191-236b3f7f8936}
DEFINE_GUID(GUID_DEVINTERFACE_UMDF_DEMO, 
    0x7c3a0df4, 0xdf82, 0x4f36, 0xa1, 0x91, 0x23, 0x6b, 0x3f, 0x7f, 0x89, 0x36);

// 2. Define custom I/O Control Codes (IOCTL).
// This control code allows user-mode apps to send a string, which our driver will reverse.
#define IOCTL_UMDF_DEMO_REVERSE_STRING \
    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS)

// 3. WDF Event Callback function prototypes.
extern "C" {
    // Driver entry point
    DRIVER_INITIALIZE DriverEntry;

    // Called when the PnP manager detects the driver's device
    EVT_WDF_DRIVER_DEVICE_ADD EvtDriverDeviceAdd;

    // Called when a user-mode application sends an IOCTL
    EVT_WDF_IO_QUEUE_IO_DEVICE_CONTROL EvtIoDeviceControl;
}
