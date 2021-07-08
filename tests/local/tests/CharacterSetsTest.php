<?php
require_once 'include/bootstrap.inc.php';

class CharacterSetsTests extends \PHPUnit\Framework\TestCase {
	public function testToCanonical() {
		$charset = Zotero_CharacterSets::toCanonical("iso-8859-1");
		$this->assertEquals("windows-1252", $charset);
	}
}
