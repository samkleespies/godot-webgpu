/**************************************************************************/
/*  test_icu_map.cpp                                                      */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             GODOT ENGINE                               */
/*                        https://godotengine.org                         */
/**************************************************************************/
/* Copyright (c) 2014-present Godot Engine contributors (see AUTHORS.md). */
/* Copyright (c) 2007-2014 Juan Linietsky, Ariel Manzur.                  */
/*                                                                        */
/* Permission is hereby granted, free of charge, to any person obtaining  */
/* a copy of this software and associated documentation files (the        */
/* "Software"), to deal in the Software without restriction, including    */
/* without limitation the rights to use, copy, modify, merge, publish,    */
/* distribute, sublicense, and/or sell copies of the Software, and to     */
/* permit persons to whom the Software is furnished to do so, subject to  */
/* the following conditions:                                              */
/*                                                                        */
/* The above copyright notice and this permission notice shall be         */
/* included in all copies or substantial portions of the Software.        */
/*                                                                        */
/* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,        */
/* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF     */
/* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. */
/* IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY   */
/* CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,   */
/* TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE      */
/* SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                 */
/**************************************************************************/

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cassert>
#include <cerrno>
#include <cstring>
#include <string>

static const char *replacement;
static const char *victim;
static int opened;
static int test_open(const char *path, int flags) {
	if (replacement && std::strcmp(path, victim) == 0) {
		assert(rename(replacement, victim) == 0);
		replacement = nullptr;
	}
	opened = open(path, flags);
	return opened;
}
#define open test_open
#include "../../thirdparty/icu4c/common/umapfile.cpp"
#undef open

U_CFUNC void UDataMemory_init(UDataMemory *data) {
	std::memset(data, 0, sizeof(*data));
}

int main() {
	char directory[] = "/tmp/godot-icu-map-XXXXXX";
	assert(mkdtemp(directory));
	const std::string path = std::string(directory) + "/data";
	const std::string swap = std::string(directory) + "/swap";
	int fd = open(path.c_str(), O_CREAT | O_RDWR, 0600);
	assert(fd >= 0 && ftruncate(fd, 4096) == 0);
	close(fd);
	fd = open(swap.c_str(), O_CREAT | O_RDWR, 0600);
	assert(fd >= 0 && write(fd, "replacement-data", 16) == 16);
	close(fd);
	replacement = swap.c_str();
	victim = path.c_str();
	UErrorCode status = U_ZERO_ERROR;
	UDataMemory data;
	assert(uprv_mapFile(&data, path.c_str(), &status));
	assert(static_cast<const char *>(data.map) - static_cast<const char *>(data.mapAddr) == 16);
	assert(std::memcmp(data.pHeader, "replacement-data", 16) == 0);
	assert(fcntl(opened, F_GETFD) == -1 && errno == EBADF);
	uprv_unmapFile(&data);
	for (off_t size : { off_t(0), off_t(INT32_MAX) + 1 }) {
		fd = open(path.c_str(), O_RDWR);
		assert(fd >= 0 && ftruncate(fd, size) == 0);
		close(fd);
		assert(!uprv_mapFile(&data, path.c_str(), &status));
		assert(fcntl(opened, F_GETFD) == -1 && errno == EBADF);
		assert(data.mapAddr == nullptr);
	}
	assert(unlink(path.c_str()) == 0);
	assert(rmdir(directory) == 0);
}
