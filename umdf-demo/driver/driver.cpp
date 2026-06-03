#include "driver.h"

/**
 * DriverEntry:
 * This is the initial entry point when the operating system loads the DLL 
 * inside the WUDFHost.exe process.
 */
NTSTATUS DriverEntry(
    _In_ PDRIVER_OBJECT  DriverObject,
    _In_ PUNICODE_STRING RegistryPath
)
{
    WDF_DRIVER_CONFIG config;
    NTSTATUS status;

    // Initialize WDF driver config, binding the EvtDriverDeviceAdd callback
    WDF_DRIVER_CONFIG_INIT(&config, EvtDriverDeviceAdd);

    // Create the WDFDRIVER object
    status = WdfDriverCreate(
        DriverObject,
        RegistryPath,
        WDF_NO_OBJECT_ATTRIBUTES,
        &config,
        WDF_NO_HANDLE
    );

    return status;
}

/**
 * EvtDriverDeviceAdd:
 * Called by the WDF framework when the PnP (Plug and Play) manager detects
 * a new hardware device corresponding to this driver.
 */
NTSTATUS EvtDriverDeviceAdd(
    _In_ WDFDRIVER       Driver,
    _In_ PWDFDEVICE_INIT DeviceInit
)
{
    UNREFERENCED_PARAMETER(Driver);

    WDFDEVICE device;
    WDF_IO_QUEUE_CONFIG queueConfig;
    NTSTATUS status;

    // 1. Create the WDFDEVICE object representing our logical device
    status = WdfDeviceCreate(&DeviceInit, WDF_NO_OBJECT_ATTRIBUTES, &device);
    if (!NT_SUCCESS(status)) {
        return status;
    }

    // 2. Publish our Device Interface so user-mode applications can open handles to it
    status = WdfDeviceCreateDeviceInterface(
        device,
        &GUID_DEVINTERFACE_UMDF_DEMO,
        NULL // Optional Reference String
    );
    if (!NT_SUCCESS(status)) {
        return status;
    }

    // 3. Configure the Default I/O Queue to receive requests from the Console App
    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(
        &queueConfig,
        WdfIoQueueDispatchSequential // Handle requests one at a time for safety
    );

    // Register our callback to handle device I/O control requests (DeviceIoControl)
    queueConfig.EvtIoDeviceControl = EvtIoDeviceControl;

    // Create and assign the default queue to the device
    status = WdfIoQueueCreate(
        device,
        &queueConfig,
        WDF_NO_OBJECT_ATTRIBUTES,
        WDF_NO_HANDLE
    );

    return status;
}

/**
 * EvtIoDeviceControl:
 * Called whenever a user-mode application makes a DeviceIoControl call 
 * using a handle to our device.
 */
VOID EvtIoDeviceControl(
    _In_ WDFQUEUE   Queue,
    _In_ WDFREQUEST Request,
    _In_ size_t     OutputBufferLength,
    _In_ size_t     InputBufferLength,
    _In_ ULONG      IoControlCode
)
{
    UNREFERENCED_PARAMETER(Queue);
    
    NTSTATUS status = STATUS_INVALID_DEVICE_REQUEST;
    size_t bytesReturned = 0;

    // Check which Control Code was received
    if (IoControlCode == IOCTL_UMDF_DEMO_REVERSE_STRING) {
        PCHAR inputBuffer = NULL;
        PCHAR outputBuffer = NULL;
        size_t inputSize = 0;
        size_t outputSize = 0;

        // 1. Retrieve the input buffer containing the string sent by the application
        status = WdfRequestRetrieveInputBuffer(
            Request,
            1, // Minimum buffer size required
            (PVOID*)&inputBuffer,
            &inputSize
        );

        // 2. Retrieve the output buffer where we will write our response
        if (NT_SUCCESS(status)) {
            status = WdfRequestRetrieveOutputBuffer(
                Request,
                1,
                (PVOID*)&outputBuffer,
                &outputSize
            );
        }

        // 3. Process the string if both buffers were retrieved successfully
        if (NT_SUCCESS(status) && inputBuffer && outputBuffer) {
            // Null-terminate safely within limits
            size_t strLen = min(inputSize - 1, strlen(inputBuffer));
            
            // Check if output buffer is large enough to hold the output + null terminator
            if (outputSize >= strLen + 1) {
                // Copy string to output buffer
                memcpy(outputBuffer, inputBuffer, strLen);
                outputBuffer[strLen] = '\0';

                // Reverse the string in-place in the output buffer
                for (size_t i = 0; i < strLen / 2; ++i) {
                    char temp = outputBuffer[i];
                    outputBuffer[i] = outputBuffer[strLen - 1 - i];
                    outputBuffer[strLen - 1 - i] = temp;
                }

                bytesReturned = strLen + 1;
                status = STATUS_SUCCESS;
            } else {
                status = STATUS_BUFFER_TOO_SMALL;
            }
        }
    }

    // 4. Complete the WDF request and return status to the calling user-mode application
    WdfRequestCompleteWithInformation(Request, status, bytesReturned);
}
