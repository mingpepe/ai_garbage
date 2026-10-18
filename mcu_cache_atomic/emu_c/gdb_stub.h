#ifndef GDB_STUB_H
#define GDB_STUB_H

#include "soc.h"

int gdb_server_run(soc_t *soc, const char *hex_path, int port);

#endif /* GDB_STUB_H */
