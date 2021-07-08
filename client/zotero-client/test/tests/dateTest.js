describe("Zotero.Date", function() {
	describe("#getMonths()", function () {
		var origLocale;
		var englishShort = [
			"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
		];
		var englishLong = [
			"January", "February", "March", "April", "May", "June", "July", "August", "September",
			"October", "November", "December"
		];
		var frenchShort = [
			"jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"
		];
		var frenchLong = [
			"janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
			"octobre", "novembre", "décembre"
		];
		
		before(function () {
			origLocale = Zotero.locale;
		});
		
		after(function () {
			Zotero.locale = origLocale;
		});
		
		describe("English", function () {
			beforeEach(function* () {
				if (Zotero.locale != 'en-US') {
					Zotero.locale = 'en-US';
					Zotero.Date.init();
				}
			});
			
			it("should get English short months", function () {
				let months = Zotero.Date.getMonths().short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, englishShort);
			});
			
			it("should get English long months", function () {
				let months = Zotero.Date.getMonths().long;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, englishLong);
			});
			
			it("shouldn't repeat months in 'withEnglish' mode", function () {
				let months = Zotero.Date.getMonths(true).short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, englishShort);
			});
			
			it("should resolve to English from unknown locale", function* () {
				Zotero.locale = 'zz';
				Zotero.Date.init();
				let months = Zotero.Date.getMonths().short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, englishShort);
			});
			
			it("shouldn't repeat English with unknown locale", function* () {
				Zotero.locale = 'zz';
				Zotero.Date.init();
				let months = Zotero.Date.getMonths(true).short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, englishShort);
			});
		});
		
		describe("French", function () {
			beforeEach(function* () {
				if (Zotero.locale != 'fr-FR') {
					Zotero.locale = 'fr-FR';
					Zotero.Date.init();
				}
			});
			
			it("should get French short months", function () {
				let months = Zotero.Date.getMonths().short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, frenchShort);
			});
			
			it("should get French long months", function () {
				let months = Zotero.Date.getMonths().long;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, frenchLong);
			});
			
			it("should get French short months with English", function () {
				let months = Zotero.Date.getMonths(true).short;
				assert.lengthOf(months, 24);
				assert.sameMembers(months, frenchShort.concat(englishShort));
			});
			
			it("should get French long months with English", function () {
				let months = Zotero.Date.getMonths(true).long;
				assert.lengthOf(months, 24);
				assert.sameMembers(months, frenchLong.concat(englishLong));
			});
			
			it("should resolve from two-letter locale", function* () {
				Zotero.locale = 'fr';
				Zotero.Date.init();
				let months = Zotero.Date.getMonths().short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, frenchShort);
			});
			
			it("should resolve from unknown four-letter locale with common prefix", function* () {
				Zotero.locale = 'fr-ZZ';
				Zotero.Date.init();
				let months = Zotero.Date.getMonths().short;
				assert.lengthOf(months, 12);
				assert.sameMembers(months, frenchShort);
			});
		});
	});
	
	describe("#sqlToDate()", function () {
		it("should convert an SQL local date into a JS Date object", function* () {
			var d1 = new Date();
			var sqlDate = d1.getFullYear()
				+ '-'
				+ Zotero.Utilities.lpad(d1.getMonth() + 1, '0', 2)
				+ '-'
				+ Zotero.Utilities.lpad(d1.getDate(), '0', 2)
				+ ' '
				+ Zotero.Utilities.lpad(d1.getHours(), '0', 2)
				+ ':'
				+ Zotero.Utilities.lpad(d1.getMinutes(), '0', 2)
				+ ':'
				+ Zotero.Utilities.lpad(d1.getSeconds(), '0', 2);
			var offset = d1.getTimezoneOffset() * 60 * 1000;
			var d2 = Zotero.Date.sqlToDate(sqlDate);
			assert.equal(
				Zotero.Date.sqlToDate(sqlDate).getTime(),
				Math.floor(new Date().getTime() / 1000) * 1000
			);
		})
		
		it("should convert an SQL UTC date into a JS Date object", function* () {
			var date = "2016-02-27 22:00:00";
			date = Zotero.Date.sqlToDate(date, true);
			assert.equal(date.getTime(), 1456610400000);
		});
		
		it("should convert an SQL UTC date without seconds into a JS Date object", function () {
			var date = "2016-02-27 22:00";
			date = Zotero.Date.sqlToDate(date, true);
			assert.equal(date.getTime(), 1456610400000);
		})
	})
	
	describe("#isISODate()", function () {
		it("should determine whether a date is an ISO 8601 date", function () {
			assert.ok(Zotero.Date.isISODate("2015"));
			assert.ok(Zotero.Date.isISODate("2015-04"));
			assert.ok(Zotero.Date.isISODate("2015-04-29"));
			assert.ok(Zotero.Date.isISODate("2015-04-29T17:28"));
			assert.ok(Zotero.Date.isISODate("2015-04-29T17:28Z"));
			assert.isFalse(Zotero.Date.isISODate("2015-04-29 17:28"));
		})
	})
	
	describe("#strToDate()", function () {
		it("should return object without date parts for null", function () {
			var o = Zotero.Date.strToDate(null);
			assert.notProperty(o, 'year');
		});
		
		it("should return object without date parts for undefined", function () {
			var o = Zotero.Date.strToDate();
			assert.notProperty(o, 'year');
		});
		
		it("should return object without date parts for false", function () {
			var o = Zotero.Date.strToDate(false);
			assert.notProperty(o, 'year');
		});
		
		it("should return object without date parts for empty string", function () {
			var o = Zotero.Date.strToDate('');
			assert.notProperty(o, 'year');
		});
		
		it("should return object without date parts for blank string", function () {
			var o = Zotero.Date.strToDate(' ');
			assert.notProperty(o, 'year');
		});
		
		it("should parse two- and three-digit dates with leading zeros", function () {
			var o;
			
			o = Zotero.Date.strToDate('001');
			assert.equal(o.year, 1);
			
			o = Zotero.Date.strToDate('0001');
			assert.equal(o.year, 1);
			
			o = Zotero.Date.strToDate('012');
			assert.equal(o.year, 12);
			
			o = Zotero.Date.strToDate('0012');
			assert.equal(o.year, 12);
			
			o = Zotero.Date.strToDate('0123');
			assert.equal(o.year, 123);
			
			o = Zotero.Date.strToDate('01/01/08');
			assert.equal(o.year, 2008);
		});
		
		it("should parse two-digit year greater than current year as previous century", function () {
			var o = Zotero.Date.strToDate('1/1/68');
			assert.equal(o.year, 1968);
		});
		
		it("should parse two-digit year less than or equal to current year as current century", function () {
			var o = Zotero.Date.strToDate('1/1/19');
			assert.equal(o.year, 2019);
		});
		
		it("should parse one-digit month and four-digit year", function () {
			var o = Zotero.Date.strToDate('8/2020');
			assert.equal(o.month, 7);
			assert.isUndefined(o.day);
			assert.equal(o.year, 2020);
		});
		
		it("should parse two-digit month with leading zero and four-digit year", function () {
			var o = Zotero.Date.strToDate('08/2020');
			assert.equal(o.month, 7);
			assert.isUndefined(o.day);
			assert.equal(o.year, 2020);
		});
		
		it("should parse string with just month number", function () {
			var o = Zotero.Date.strToDate('1');
			assert.equal(o.month, 0);
			assert.isUndefined(o.year);
			assert.equal(o.order, 'm');
		});
		
		it("should parse string with just day number", function () {
			var o = Zotero.Date.strToDate('25');
			assert.equal(o.day, 25);
			assert.isUndefined(o.month);
			assert.isUndefined(o.year);
			assert.equal(o.order, 'd');
		});
		
		it("should work in translator sandbox", function* () {
			var item = createUnsavedDataObject('item');
			item.libraryID = Zotero.Libraries.userLibraryID;
			item.setField('date', '2017-01-17');
			
			var called = false;
			var translation = new Zotero.Translate.Export();
			translation.setItems([item]);
			translation.setTranslator("9cb70025-a888-4a29-a210-93ec52da40d4"); // BibTeX
			translation.setHandler("done", function (obj, worked) {
				called = true;
				assert.isTrue(worked);
				assert.include(obj.string, "{2017}");
			});
			yield translation.translate();
			assert.ok(called);
		});
	});
	
	describe("#isHTTPDate()", function() {
		it("should determine whether a date is an RFC 2822 compliant date", function() {
			assert.ok(Zotero.Date.isHTTPDate("Mon, 13 Jun 2016 02:09:08   +4000"));
			assert.ok(Zotero.Date.isHTTPDate("13 Jun 2016 02:09:08 +4000"));
			assert.ok(Zotero.Date.isHTTPDate("13 Jun 2016   02:09 +4000"));
			assert.ok(Zotero.Date.isHTTPDate("13  Jun  2016 02:09 EDT"));
		})
	})
})
